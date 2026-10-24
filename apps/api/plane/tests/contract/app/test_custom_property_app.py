# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for project custom fields and their values on work items."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    CustomProperty,
    Issue,
    IssueActivity,
    IssueCustomPropertyValue,
    Project,
    ProjectMember,
    User,
    WorkspaceMember,
)


def properties_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/custom-properties/"
    return f"{base}{pk}/" if pk else base


def values_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/custom-property-values/"


def _member(workspace, project, role):
    user = User.objects.create(email=f"m-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Fields", identifier=f"F{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def issue(db, workspace, project):
    return Issue.objects.create(name="Has fields", project=project, workspace=workspace)


def _create(client, workspace, project, **payload):
    return client.post(properties_url(workspace.slug, project.id), payload, format="json")


@pytest.mark.contract
class TestCustomPropertyManagement:
    def test_admin_creates_select_field_with_generated_option_ids(self, session_client, workspace, project):
        response = _create(
            session_client,
            workspace,
            project,
            name="Customer tier",
            property_type="select",
            options=[{"name": "Gold"}, {"name": "Silver", "color": "#c0c0c0"}],
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert [o["name"] for o in response.data["options"]] == ["Gold", "Silver"]
        assert all(o["id"] for o in response.data["options"])

    def test_duplicate_name_is_rejected_case_insensitively(self, session_client, workspace, project):
        _create(session_client, workspace, project, name="Budget", property_type="number")
        response = _create(session_client, workspace, project, name="budget", property_type="text")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_member_cannot_create_fields(self, workspace, project):
        _, client = _member(workspace, project, role=15)
        response = _create(client, workspace, project, name="Nope", property_type="text")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_type_cannot_change(self, session_client, workspace, project):
        prop = _create(session_client, workspace, project, name="Score", property_type="number").data
        response = session_client.patch(
            properties_url(workspace.slug, project.id, prop["id"]), {"property_type": "text"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_removing_an_option_clears_values_that_used_it(self, session_client, workspace, project, issue):
        prop = _create(
            session_client,
            workspace,
            project,
            name="Tags",
            property_type="multi_select",
            options=[{"name": "A"}, {"name": "B"}],
        ).data
        a, b = prop["options"]
        session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): [a["id"], b["id"]]}, format="json"
        )

        response = session_client.patch(
            properties_url(workspace.slug, project.id, prop["id"]), {"options": [a]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert IssueCustomPropertyValue.objects.get(issue=issue).value == [a["id"]]

    def test_deleting_a_field_deletes_its_values(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Notes", property_type="text").data
        session_client.patch(values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): "hi"}, format="json")

        response = session_client.delete(properties_url(workspace.slug, project.id, prop["id"]))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueCustomPropertyValue.objects.filter(issue=issue).exists()
        assert not CustomProperty.all_objects.filter(pk=prop["id"]).exists()


@pytest.mark.contract
class TestIssueCustomPropertyValues:
    @pytest.mark.parametrize(
        "property_type,value,stored",
        [
            ("text", "hello", "hello"),
            ("number", "42", 42),
            ("number", 2.5, 2.5),
            ("date", "2026-10-23", "2026-10-23"),
            ("checkbox", True, True),
            ("url", "example.com/a", "https://example.com/a"),
        ],
    )
    def test_values_are_normalized(self, session_client, workspace, project, issue, property_type, value, stored):
        prop = _create(session_client, workspace, project, name=f"F {property_type}", property_type=property_type)
        response = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop.data["id"]): value}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data == {str(prop.data["id"]): stored}

    @pytest.mark.parametrize(
        "property_type,value",
        [("number", "abc"), ("number", True), ("date", "23/10/2026"), ("checkbox", "yes"), ("url", "not a url")],
    )
    def test_invalid_values_are_rejected(self, session_client, workspace, project, issue, property_type, value):
        prop = _create(session_client, workspace, project, name=f"F {property_type}", property_type=property_type)
        response = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop.data["id"]): value}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_select_rejects_unknown_option(self, session_client, workspace, project, issue):
        prop = _create(
            session_client, workspace, project, name="Tier", property_type="select", options=[{"name": "Gold"}]
        ).data
        response = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): str(uuid4())}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_member_field_only_accepts_project_members(self, session_client, workspace, project, issue, create_user):
        prop = _create(session_client, workspace, project, name="Reviewer", property_type="member").data
        outsider = User.objects.create(email="outsider@example.com", username="outsider")

        ok = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): [str(create_user.id)]}, format="json"
        )
        bad = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): [str(outsider.id)]}, format="json"
        )

        assert ok.status_code == status.HTTP_200_OK
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

    def test_clearing_a_value_and_activity_is_recorded(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Budget", property_type="number").data
        url = values_url(workspace.slug, project.id, issue.id)
        session_client.patch(url, {str(prop["id"]): 10}, format="json")

        response = session_client.patch(url, {str(prop["id"]): None}, format="json")

        assert response.data == {}
        activities = IssueActivity.objects.filter(issue=issue, field="custom_property").order_by("created_at")
        assert [(a.old_value, a.new_value) for a in activities] == [("", "10"), ("10", "")]
        assert activities[0].comment == "Budget"

    def test_field_from_another_project_is_rejected(self, session_client, workspace, project, issue, create_user):
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=other, member=create_user, workspace=workspace, role=20)
        foreign = _create(session_client, workspace, other, name="Foreign", property_type="text").data

        response = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(foreign["id"]): "x"}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_hidden_field_cannot_be_written(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Hidden", property_type="text").data
        CustomProperty.objects.filter(pk=prop["id"]).update(is_active=False)

        response = session_client.patch(
            values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): "x"}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not IssueCustomPropertyValue.objects.filter(issue=issue).exists()

    def test_guest_cannot_read_values_of_others_work_items(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Secret", property_type="text").data
        session_client.patch(values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): "x"}, format="json")
        _, guest = _member(workspace, project, role=5)

        response = guest.get(values_url(workspace.slug, project.id, issue.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_guest_cannot_write_values(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Text", property_type="text").data
        _, guest = _member(workspace, project, role=5)

        response = guest.patch(values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): "x"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN


def bulk_values_url(slug, project_id, issue_ids):
    ids = ",".join(str(i) for i in issue_ids)
    return f"/api/workspaces/{slug}/projects/{project_id}/custom-property-values/?issue_ids={ids}"


@pytest.mark.contract
class TestBulkCustomPropertyValues:
    def test_values_for_many_work_items(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Score", property_type="number").data
        other = Issue.objects.create(name="Second", project=project, workspace=workspace)
        session_client.patch(values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): 7}, format="json")

        response = session_client.get(bulk_values_url(workspace.slug, project.id, [issue.id, other.id, "junk"]))

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {str(issue.id): {str(prop["id"]): 7}, str(other.id): {}}

    def test_work_items_of_other_projects_are_not_returned(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OTB", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=other, member=create_user, workspace=workspace, role=20)
        prop = _create(session_client, workspace, other, name="Secret", property_type="text").data
        foreign = Issue.objects.create(name="Foreign", project=other, workspace=workspace)
        session_client.patch(values_url(workspace.slug, other.id, foreign.id), {str(prop["id"]): "x"}, format="json")

        response = session_client.get(bulk_values_url(workspace.slug, project.id, [foreign.id]))

        assert response.data == {str(foreign.id): {}}

    def test_hidden_properties_are_left_out(self, session_client, workspace, project, issue):
        prop = _create(session_client, workspace, project, name="Hidden", property_type="text").data
        session_client.patch(values_url(workspace.slug, project.id, issue.id), {str(prop["id"]): "x"}, format="json")
        CustomProperty.objects.filter(pk=prop["id"]).update(is_active=False)

        response = session_client.get(bulk_values_url(workspace.slug, project.id, [issue.id]))

        assert response.data == {str(issue.id): {}}
