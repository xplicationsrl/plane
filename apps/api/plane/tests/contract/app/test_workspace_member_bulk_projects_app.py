# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for adding one workspace member to many projects at once."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, ProjectUserProperty, User, Workspace, WorkspaceMember


def url(slug, member_id):
    return f"/api/workspaces/{slug}/members/{member_id}/projects/"


def _user(workspace=None, role=15):
    user = User.objects.create(email=f"b-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    if workspace is not None:
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return user


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _project(workspace, owner, name):
    return Project.objects.create(name=name, identifier=uuid4().hex[:6].upper(), workspace=workspace, created_by=owner)


@pytest.fixture
def sess_projects(db, workspace, create_user):
    return [_project(workspace, create_user, f"SeSS {n}") for n in range(3)]


@pytest.fixture
def other_project(db, workspace, create_user):
    return _project(workspace, create_user, "Office move")


def _memberships(user):
    return {m.project_id: m for m in ProjectMember.objects.filter(member=user)}


@pytest.mark.contract
class TestAddMemberToManyProjects:
    def test_adds_a_member_to_every_listed_project(self, session_client, workspace, sess_projects, other_project):
        simina = _user(workspace, role=15)

        response = session_client.post(
            url(workspace.slug, simina.id), {"project_ids": [str(p.id) for p in sess_projects]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["added"] == 3
        assert response.data["updated"] == response.data["already_member"] == response.data["skipped"] == 0
        memberships = _memberships(simina)
        assert set(memberships) == {p.id for p in sess_projects}
        assert all(m.role == 15 and m.is_active for m in memberships.values())
        assert ProjectUserProperty.objects.filter(user=simina).count() == 3
        assert other_project.id not in memberships

    def test_a_workspace_guest_becomes_a_project_guest(self, session_client, workspace, sess_projects):
        simina = _user(workspace, role=5)

        response = session_client.post(
            url(workspace.slug, simina.id), {"project_ids": [str(p.id) for p in sess_projects]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert {m.role for m in _memberships(simina).values()} == {5}

    def test_role_cannot_exceed_the_workspace_role(self, session_client, workspace, sess_projects):
        guest = _user(workspace, role=5)

        response = session_client.post(
            url(workspace.slug, guest.id), {"project_ids": [str(sess_projects[0].id)], "role": 15}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not ProjectMember.objects.filter(member=guest).exists()

    def test_a_workspace_admin_is_always_a_project_admin(self, session_client, workspace, sess_projects):
        admin = _user(workspace, role=20)

        refused = session_client.post(
            url(workspace.slug, admin.id), {"project_ids": [str(sess_projects[0].id)], "role": 15}, format="json"
        )
        added = session_client.post(
            url(workspace.slug, admin.id), {"project_ids": [str(sess_projects[0].id)]}, format="json"
        )

        assert refused.status_code == status.HTTP_400_BAD_REQUEST
        assert added.status_code == status.HTTP_200_OK
        assert _memberships(admin)[sess_projects[0].id].role == 20

    def test_existing_memberships_are_reactivated_or_left_alone(self, session_client, workspace, sess_projects):
        simina = _user(workspace, role=15)
        ProjectMember.objects.create(workspace=workspace, project=sess_projects[0], member=simina, role=15)
        ProjectMember.objects.create(
            workspace=workspace, project=sess_projects[1], member=simina, role=5, is_active=False
        )

        response = session_client.post(
            url(workspace.slug, simina.id), {"project_ids": [str(p.id) for p in sess_projects]}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert (response.data["added"], response.data["updated"], response.data["already_member"]) == (1, 1, 1)
        memberships = _memberships(simina)
        assert memberships[sess_projects[1].id].is_active is True
        assert memberships[sess_projects[1].id].role == 15
        assert ProjectMember.objects.filter(member=simina, project=sess_projects[0]).count() == 1

    def test_unknown_foreign_and_archived_projects_are_skipped(
        self, session_client, workspace, sess_projects, create_user
    ):
        simina = _user(workspace, role=15)
        elsewhere = Workspace.objects.create(name="Elsewhere", owner=create_user, slug=f"else-{uuid4().hex[:6]}")
        foreign = _project(elsewhere, create_user, "Foreign")
        archived = _project(workspace, create_user, "Old")
        Project.objects.filter(pk=archived.id).update(archived_at="2026-01-01T00:00:00Z")

        response = session_client.post(
            url(workspace.slug, simina.id),
            {"project_ids": [str(sess_projects[0].id), str(foreign.id), str(archived.id), str(uuid4())]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["added"] == 1
        assert response.data["skipped"] == 3
        assert set(_memberships(simina)) == {sess_projects[0].id}

    @pytest.mark.parametrize("body", [{}, {"project_ids": []}, {"project_ids": "abc"}])
    def test_needs_a_list_of_projects(self, session_client, workspace, body):
        simina = _user(workspace, role=15)

        response = session_client.post(url(workspace.slug, simina.id), body, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_target_must_be_an_active_workspace_member(self, session_client, workspace, sess_projects):
        outsider = _user()
        former = _user(workspace, role=15)
        WorkspaceMember.objects.filter(member=former).update(is_active=False)

        for user in (outsider, former):
            response = session_client.post(
                url(workspace.slug, user.id), {"project_ids": [str(sess_projects[0].id)]}, format="json"
            )
            assert response.status_code == status.HTTP_404_NOT_FOUND
            assert not ProjectMember.objects.filter(member=user).exists()

    @pytest.mark.parametrize("role", [15, 5])
    def test_only_workspace_admins_may_do_this(self, workspace, sess_projects, role):
        simina = _user(workspace, role=15)

        response = _client(_user(workspace, role=role)).post(
            url(workspace.slug, simina.id), {"project_ids": [str(sess_projects[0].id)]}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ProjectMember.objects.filter(member=simina).exists()
