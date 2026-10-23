# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for sharing work items with other projects."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueActivity,
    IssueProjectLink,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


def links_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/linked-projects/"


def shared_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/shared-issues/"


def _project(workspace, owner, name):
    project = Project.objects.create(
        name=name, identifier=f"{name[:2].upper()}{uuid4().hex[:3].upper()}", workspace=workspace, created_by=owner
    )
    ProjectMember.objects.create(project=project, member=owner, workspace=workspace, role=20)
    State.objects.create(name="Todo", group="unstarted", project=project, default=True)
    return project


def _user(workspace, *projects, role=15):
    user = User.objects.create(email=f"u-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    for project in projects:
        ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.fixture
def home(db, workspace, create_user):
    return _project(workspace, create_user, "Home")


@pytest.fixture
def marketing(db, workspace, create_user):
    return _project(workspace, create_user, "Marketing")


@pytest.fixture
def issue(db, workspace, home):
    return Issue.objects.create(name="Launch page", project=home, workspace=workspace, priority="high")


@pytest.mark.contract
class TestSharingWorkItems:
    def test_share_and_list_in_the_other_project(self, session_client, workspace, home, marketing, issue):
        response = session_client.put(
            links_url(workspace.slug, home.id, issue.id), {"project_ids": [str(marketing.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["project_ids"] == [str(marketing.id)]
        shared = session_client.get(shared_url(workspace.slug, marketing.id)).data
        assert [item["name"] for item in shared] == ["Launch page"]
        assert shared[0]["project_identifier"] == home.identifier
        assert shared[0]["state"]["name"] == "Todo"
        assert shared[0]["can_open"] is True
        assert IssueActivity.objects.filter(issue=issue, field="shared_project", verb="created").exists()

    def test_unsharing_removes_it(self, session_client, workspace, home, marketing, issue):
        url = links_url(workspace.slug, home.id, issue.id)
        session_client.put(url, {"project_ids": [str(marketing.id)]}, format="json")

        session_client.put(url, {"project_ids": []}, format="json")

        assert not IssueProjectLink.objects.filter(issue=issue).exists()
        assert session_client.get(shared_url(workspace.slug, marketing.id)).data == []

    def test_home_project_is_ignored(self, session_client, workspace, home, issue):
        response = session_client.put(
            links_url(workspace.slug, home.id, issue.id), {"project_ids": [str(home.id)]}, format="json"
        )
        assert response.data["project_ids"] == []

    def test_cannot_share_into_a_project_you_are_not_in(self, workspace, home, marketing, issue):
        _, client = _user(workspace, home)

        response = client.put(
            links_url(workspace.slug, home.id, issue.id), {"project_ids": [str(marketing.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not IssueProjectLink.objects.exists()

    def test_cannot_share_into_another_workspace(self, session_client, workspace, home, issue, create_user):
        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug=f"other-{uuid4().hex[:6]}")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        foreign = _project(other_ws, create_user, "Foreign")

        response = session_client.put(
            links_url(workspace.slug, home.id, issue.id), {"project_ids": [str(foreign.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_members_of_target_who_cannot_open_the_home_project(
        self, session_client, workspace, home, marketing, issue
    ):
        session_client.put(
            links_url(workspace.slug, home.id, issue.id), {"project_ids": [str(marketing.id)]}, format="json"
        )
        _, outsider = _user(workspace, marketing)

        shared = outsider.get(shared_url(workspace.slug, marketing.id)).data

        assert shared[0]["can_open"] is False

    def test_guest_cannot_list_shared_items(self, workspace, marketing):
        _, guest = _user(workspace, marketing, role=5)
        assert guest.get(shared_url(workspace.slug, marketing.id)).status_code == status.HTTP_403_FORBIDDEN

    def test_deleted_work_items_drop_out_of_the_shared_list(self, session_client, workspace, home, marketing, issue):
        session_client.put(
            links_url(workspace.slug, home.id, issue.id), {"project_ids": [str(marketing.id)]}, format="json"
        )
        issue.delete()

        assert session_client.get(shared_url(workspace.slug, marketing.id)).data == []
