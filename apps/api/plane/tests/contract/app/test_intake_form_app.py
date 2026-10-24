# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for public intake forms."""

from unittest import mock
from uuid import uuid4

import pytest
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    CustomProperty,
    IntakeForm,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueCustomPropertyValue,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.space.views.intake_form import FormSubmitThrottle


def forms_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/intake-forms/"
    return f"{base}{pk}/" if pk else base


def public_url(anchor):
    return f"/api/public/forms/{anchor}/"


@pytest.fixture(autouse=True)
def _fresh_throttles():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Helpdesk", identifier=f"H{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(name="Todo", group="unstarted", project=project, default=True)
    return project


@pytest.fixture
def tier(db, project):
    return CustomProperty.objects.create(
        name="Plan",
        property_type="select",
        options=[{"id": "gold", "name": "Gold", "color": "#ffcc00"}],
        project=project,
    )


@pytest.fixture
def form(session_client, workspace, project, tier):
    response = session_client.post(
        forms_url(workspace.slug, project.id),
        {
            "name": "Report a bug",
            "description": "Tell us what broke",
            "success_message": "Thanks!",
            "fields": [
                {"key": "description", "required": True},
                {"key": "submitter_email", "required": True},
                {"key": "priority"},
                {"key": f"property:{tier.id}", "label": "Your plan"},
            ],
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return IntakeForm.objects.get(pk=response.data["id"])


def _submit(anchor, values, **extra):
    return APIClient().post(public_url(anchor), {"values": values, **extra}, format="json")


@pytest.mark.contract
class TestFormManagement:
    def test_member_cannot_create_forms(self, workspace, project):
        user = User.objects.create(email="m@example.com", username="m-user")
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
        ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=15)
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(forms_url(workspace.slug, project.id), {"name": "x", "fields": []}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.parametrize(
        "fields",
        [[{"key": "assignees"}], [{"key": "description"}, {"key": "description"}], [{"key": f"property:{uuid4()}"}]],
    )
    def test_invalid_fields_are_rejected(self, session_client, workspace, project, fields):
        response = session_client.post(
            forms_url(workspace.slug, project.id), {"name": "x", "fields": fields}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_people_properties_cannot_go_on_public_forms(self, session_client, workspace, project):
        people = CustomProperty.objects.create(name="Owner", property_type="member", project=project)
        response = session_client.post(
            forms_url(workspace.slug, project.id),
            {"name": "x", "fields": [{"key": f"property:{people.id}"}]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestPublicForm:
    def test_definition_is_public(self, form, tier):
        response = APIClient().get(public_url(form.anchor))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Report a bug"
        assert [f["type"] for f in response.data["fields"]] == ["textarea", "email", "priority", "select"]
        assert response.data["fields"][3]["label"] == "Your plan"
        assert response.data["fields"][3]["options"] == [{"id": "gold", "name": "Gold"}]

    def test_inactive_form_is_hidden(self, form):
        form.is_active = False
        form.save()
        assert APIClient().get(public_url(form.anchor)).status_code == status.HTTP_404_NOT_FOUND

    def test_submission_creates_a_work_item(self, form, project, tier):
        response = _submit(
            form.anchor,
            {
                "name": "Login fails",
                "description": "Error 500\n<script>alert(1)</script>",
                "submitter_email": "ann@example.com",
                "priority": "high",
                f"property:{tier.id}": "gold",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["success_message"] == "Thanks!"
        issue = Issue.objects.get(project=project, name="Login fails")
        assert issue.priority == "high"
        assert "&lt;script&gt;" in issue.description_html
        assert "ann@example.com" in issue.description_html
        assert IssueCustomPropertyValue.objects.get(issue=issue).value == "gold"
        assert not IntakeIssue.objects.filter(issue=issue).exists()
        form.refresh_from_db()
        assert form.submission_count == 1

    def test_anonymous_submission_is_created_by_the_form_owner(self, form, project, create_user):
        project.intake_view = True
        project.default_assignee = create_user
        project.save()

        _submit(form.anchor, {"name": "Owned", "description": "x", "submitter_email": "a@example.com"})

        issue = Issue.objects.get(project=project, name="Owned")
        assert issue.created_by_id == create_user.id
        assert IssueAssignee.objects.get(issue=issue).created_by_id == create_user.id
        assert IntakeIssue.objects.get(issue=issue).created_by_id == create_user.id

    def test_submission_goes_to_intake_when_enabled(self, form, project):
        project.intake_view = True
        project.save()

        _submit(form.anchor, {"name": "Need access", "description": "Please", "submitter_email": "bo@example.com"})

        intake_issue = IntakeIssue.objects.get(issue__name="Need access")
        assert intake_issue.status == -2
        assert intake_issue.source == "FORM"
        assert intake_issue.source_email == "bo@example.com"
        assert intake_issue.issue.state.group == "triage"

    @pytest.mark.parametrize(
        "values,field",
        [
            ({"description": "x", "submitter_email": "a@example.com"}, "name"),
            ({"name": "x", "submitter_email": "a@example.com"}, "description"),
            ({"name": "x", "description": "x", "submitter_email": "not-an-email"}, "submitter_email"),
            ({"name": "x", "description": "x", "submitter_email": "a@example.com", "priority": "asap"}, "priority"),
        ],
    )
    def test_invalid_submissions_report_field_errors(self, form, project, values, field):
        response = _submit(form.anchor, values)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert field in response.data["errors"]
        assert not Issue.objects.filter(project=project).exists()

    def test_honeypot_submissions_are_silently_dropped(self, form, project):
        response = _submit(
            form.anchor,
            {"name": "Spam", "description": "x", "submitter_email": "a@example.com"},
            website="http://spam.example",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert not Issue.objects.filter(project=project).exists()

    def test_submissions_are_rate_limited(self, form):
        values = {"name": "x", "description": "x", "submitter_email": "a@example.com"}
        with mock.patch.object(FormSubmitThrottle, "rate", "2/hour"):
            codes = [_submit(form.anchor, values).status_code for _ in range(3)]
        assert codes == [201, 201, 429]
