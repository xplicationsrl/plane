# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Assigning a workspace member who is not in the project adds them to it, when the requester
can manage the project's members (project admin, or workspace admin in the project)."""

from unittest import mock
from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueAssignee,
    Project,
    ProjectMember,
    ProjectUserProperty,
    State,
    User,
    WorkspaceMember,
)


@pytest.fixture(autouse=True)
def _no_tasks(db):
    """Stub the deferred tasks (broker) and base_host (needs APP_BASE_URL / WEB_URL)."""
    with (
        mock.patch("plane.app.views.issue.base.issue_activity"),
        mock.patch("plane.app.views.issue.base.model_activity"),
        mock.patch("plane.app.views.issue.base.issue_description_version_task"),
        mock.patch("plane.app.views.issue.base.project_add_user_email") as email_task,
        mock.patch("plane.app.views.issue.base.base_host", return_value="http://testserver"),
    ):
        yield email_task


def _user(workspace, workspace_role):
    unique_id = uuid4().hex[:8]
    user = User.objects.create(email=f"u-{unique_id}@plane.so", username=f"u_{unique_id}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=workspace_role)
    return user


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Auto Add", identifier="AAD", workspace=workspace, created_by=create_user)
    # create_user is the workspace admin (role 20) from the shared fixture.
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20)
    State.objects.create(name="Todo", project=project, workspace=workspace, group="unstarted", default=True)
    return project


@pytest.fixture
def outsider(db, workspace):
    """A workspace MEMBER who has not joined the project."""
    return _user(workspace, 15)


@pytest.fixture
def issue(db, workspace, project):
    return Issue.objects.create(name="Work item", project=project, workspace=workspace)


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _issues_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"


def _issue_url(workspace, project, issue):
    return f"{_issues_url(workspace, project)}{issue.id}/"


def _is_assigned(issue, user):
    return IssueAssignee.objects.filter(issue=issue, assignee=user).exists()


@pytest.mark.contract
class TestIssueAssigneeAutoAdd:
    def test_admin_update_adds_outsider_to_project(self, workspace, project, issue, outsider, create_user, _no_tasks):
        response = _client(create_user).patch(
            _issue_url(workspace, project, issue), {"assignee_ids": [str(outsider.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        member = ProjectMember.objects.get(project=project, member=outsider)
        assert member.is_active and member.role == 15
        assert ProjectUserProperty.objects.filter(project=project, user=outsider).exists()
        assert _is_assigned(issue, outsider)
        _no_tasks.delay.assert_called_once()

    def test_admin_create_adds_outsider_to_project(self, workspace, project, outsider, create_user):
        response = _client(create_user).post(
            _issues_url(workspace, project), {"name": "New", "assignee_ids": [str(outsider.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ProjectMember.objects.filter(project=project, member=outsider, is_active=True).exists()
        assert _is_assigned(Issue.objects.get(pk=response.data["id"]), outsider)

    def test_reactivates_member_who_left(self, workspace, project, issue, outsider, create_user):
        ProjectMember.objects.create(workspace=workspace, project=project, member=outsider, role=15, is_active=False)

        response = _client(create_user).patch(
            _issue_url(workspace, project, issue), {"assignee_ids": [str(outsider.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert ProjectMember.objects.filter(project=project, member=outsider).count() == 1
        assert ProjectMember.objects.get(project=project, member=outsider).is_active
        assert _is_assigned(issue, outsider)

    def test_project_member_cannot_add_outsider(self, workspace, project, issue, outsider):
        requester = _user(workspace, 15)
        ProjectMember.objects.create(workspace=workspace, project=project, member=requester, role=15)

        response = _client(requester).patch(
            _issue_url(workspace, project, issue), {"assignee_ids": [str(outsider.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectMember.objects.filter(project=project, member=outsider).exists()
        assert not _is_assigned(issue, outsider)

    def test_workspace_guest_is_not_added(self, workspace, project, issue, create_user):
        guest = _user(workspace, 5)

        _client(create_user).patch(
            _issue_url(workspace, project, issue), {"assignee_ids": [str(guest.id)]}, format="json"
        )

        assert not ProjectMember.objects.filter(project=project, member=guest).exists()
        assert not _is_assigned(issue, guest)

    def test_project_guest_is_not_promoted(self, workspace, project, issue, outsider, create_user):
        ProjectMember.objects.create(workspace=workspace, project=project, member=outsider, role=5)

        _client(create_user).patch(
            _issue_url(workspace, project, issue), {"assignee_ids": [str(outsider.id)]}, format="json"
        )

        assert ProjectMember.objects.get(project=project, member=outsider).role == 5
        assert not _is_assigned(issue, outsider)

    def test_user_outside_workspace_is_not_added(self, workspace, project, issue, create_user):
        stranger = User.objects.create(email=f"s-{uuid4().hex[:8]}@plane.so", username=f"s_{uuid4().hex[:8]}")

        _client(create_user).patch(
            _issue_url(workspace, project, issue), {"assignee_ids": [str(stranger.id), "not-a-uuid"]}, format="json"
        )

        assert not ProjectMember.objects.filter(project=project, member=stranger).exists()
