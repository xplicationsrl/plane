# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for open-door project access: opening a public project makes a workspace member a member of it."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, ProjectUserProperty, User, WorkspaceMember


def project_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/"


def me_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/project-members/me/"


def _user(workspace=None, role=15):
    user = User.objects.create(email=f"d-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    if workspace is not None:
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.fixture
def public_project(db, workspace, create_user):
    project = Project.objects.create(
        name="SeSS 1", identifier="SES1", workspace=workspace, created_by=create_user, network=2
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def private_project(db, workspace, create_user):
    project = Project.objects.create(
        name="Board", identifier="BRD", workspace=workspace, created_by=create_user, network=0
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.mark.contract
class TestOpeningAPublicProject:
    @pytest.mark.parametrize("workspace_role", [15, 5])
    def test_makes_the_visitor_a_member_with_their_workspace_role(self, workspace, public_project, workspace_role):
        simina, client = _user(workspace, workspace_role)

        response = client.get(project_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["member_role"] == workspace_role
        assert str(simina.id) in [str(member) for member in response.data["members"]]
        membership = ProjectMember.objects.get(project=public_project, member=simina)
        assert membership.is_active and membership.role == workspace_role
        assert ProjectUserProperty.objects.filter(project=public_project, user=simina).exists()

    def test_the_me_endpoint_opens_the_door_too(self, workspace, public_project):
        simina, client = _user(workspace, 15)

        response = client.get(me_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["role"] == 15
        assert ProjectMember.objects.filter(project=public_project, member=simina, is_active=True).exists()

    def test_opening_twice_makes_one_membership(self, workspace, public_project):
        simina, client = _user(workspace, 15)

        client.get(project_url(workspace.slug, public_project.id))
        client.get(me_url(workspace.slug, public_project.id))
        client.get(project_url(workspace.slug, public_project.id))

        assert ProjectMember.objects.filter(project=public_project, member=simina).count() == 1
        assert ProjectUserProperty.objects.filter(project=public_project, user=simina).count() == 1

    def test_someone_removed_earlier_comes_back_with_a_fresh_role(self, workspace, public_project):
        simina, client = _user(workspace, 15)
        ProjectMember.objects.create(
            project=public_project, member=simina, workspace=workspace, role=20, is_active=False
        )

        response = client.get(project_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_200_OK
        membership = ProjectMember.objects.get(project=public_project, member=simina)
        assert membership.is_active and membership.role == 15

    def test_a_leftover_property_row_does_not_block_the_door(self, workspace, public_project):
        simina, client = _user(workspace, 15)
        # A ProjectUserProperty can outlive its membership (hard-deleted member row, old import).
        ProjectUserProperty.objects.create(project=public_project, user=simina, workspace=workspace)

        response = client.get(project_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert ProjectMember.objects.filter(project=public_project, member=simina, is_active=True).exists()
        assert ProjectUserProperty.objects.filter(project=public_project, user=simina).count() == 1

    def test_an_archived_project_is_left_alone_by_the_me_endpoint(self, workspace, public_project):
        simina, client = _user(workspace, 15)
        Project.objects.filter(pk=public_project.id).update(archived_at="2026-01-01T00:00:00Z")

        response = client.get(me_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not ProjectMember.objects.filter(project=public_project, member=simina).exists()

    def test_an_existing_member_keeps_their_role(self, workspace, public_project):
        simina, client = _user(workspace, 15)
        ProjectMember.objects.create(project=public_project, member=simina, workspace=workspace, role=5)

        response = client.get(project_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["member_role"] == 5

    def test_a_private_project_still_needs_an_invite(self, workspace, private_project):
        simina, client = _user(workspace, 15)

        response = client.get(project_url(workspace.slug, private_project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ProjectMember.objects.filter(project=private_project, member=simina).exists()
        assert client.get(me_url(workspace.slug, private_project.id)).status_code == status.HTTP_404_NOT_FOUND

    def test_a_workspace_admin_walks_into_a_private_project(self, workspace, private_project):
        boss, client = _user(workspace, 20)

        response = client.get(project_url(workspace.slug, private_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert ProjectMember.objects.get(project=private_project, member=boss).role == 20

    def test_someone_outside_the_workspace_is_refused(self, workspace, public_project):
        _, client = _user()

        response = client.get(project_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert ProjectMember.objects.filter(project=public_project).count() == 1

    def test_an_archived_project_is_left_alone(self, workspace, public_project):
        simina, client = _user(workspace, 15)
        Project.objects.filter(pk=public_project.id).update(archived_at="2026-01-01T00:00:00Z")

        response = client.get(project_url(workspace.slug, public_project.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not ProjectMember.objects.filter(project=public_project, member=simina).exists()
