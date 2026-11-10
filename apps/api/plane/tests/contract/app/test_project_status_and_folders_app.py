# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the project status (done / not done), its automatic rules, and project folders."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Project, ProjectFolder, ProjectMember, State, User, Workspace, WorkspaceMember
from plane.utils.project_status import complete_project_if_all_done


def status_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/status/"


def notice_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/reopened-notice/"


def folders_url(slug, folder_id=None):
    base = f"/api/workspaces/{slug}/project-folders/"
    return f"{base}{folder_id}/" if folder_id else base


def assign_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/folder/"


def _client(workspace=None, role=15):
    user = User.objects.create(email=f"p-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    if workspace is not None:
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Office move", identifier="OM", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def states(db, project):
    def make(name, group, **extra):
        return State.all_state_objects.create(name=name, group=group, project=project, **extra)

    return {
        "todo": make("Todo", "unstarted", default=True),
        "doing": make("In Progress", "started"),
        "done": make("Done", "completed"),
        "cancelled": make("Cancelled", "cancelled"),
        "triage": make("Triage", "triage", is_triage=True),
    }


@pytest.fixture
def other_workspace(db, create_user):
    return Workspace.objects.create(name="Elsewhere", owner=create_user, slug=f"else-{uuid4().hex[:6]}")


def _item(project, state, name="Pack boxes"):
    return Issue.objects.create(name=name, project=project, workspace=project.workspace, state=state)


def _move(item, state):
    """Change state the way the API does: load, assign, save."""
    item = Issue.objects.get(pk=item.pk)
    item.state = state
    item.save()
    return item


@pytest.mark.contract
class TestProjectStatusEndpoint:
    def test_new_projects_start_in_the_backlog(self, project):
        assert project.status == "backlog"
        assert project.reopened_at is None

    @pytest.mark.parametrize("new_status", ["backlog", "unstarted", "started", "completed", "cancelled"])
    def test_set_each_status(self, session_client, workspace, project, new_status):
        response = session_client.post(status_url(workspace.slug, project.id), {"status": new_status}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == new_status
        project.refresh_from_db()
        assert project.status == new_status

    @pytest.mark.parametrize("bad", ["triage", "done", "", None])
    def test_unknown_status_is_refused(self, session_client, workspace, project, bad):
        response = session_client.post(status_url(workspace.slug, project.id), {"status": bad}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        project.refresh_from_db()
        assert project.status == "backlog"

    @pytest.mark.parametrize("role", [20, 15, 5])
    def test_any_workspace_role_may_mark_done(self, workspace, project, role):
        response = _client(workspace, role).post(
            status_url(workspace.slug, project.id), {"status": "completed"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_outsider_is_refused(self, workspace, project):
        response = _client().post(status_url(workspace.slug, project.id), {"status": "completed"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        project.refresh_from_db()
        assert project.status == "backlog"

    def test_project_of_another_workspace_is_not_found(self, session_client, project, other_workspace, create_user):
        WorkspaceMember.objects.create(workspace=other_workspace, member=create_user, role=20)

        response = session_client.post(
            status_url(other_workspace.slug, project.id), {"status": "completed"}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        project.refresh_from_db()
        assert project.status == "backlog"

    def test_project_update_cannot_write_status_or_folder(self, session_client, workspace, project):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")

        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/",
            {"status": "completed", "folder": str(folder.id), "reopened_at": "2026-01-01T00:00:00Z"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert (project.status, project.folder_id, project.reopened_at) == ("backlog", None, None)

    def test_v1_project_update_cannot_write_status_or_folder(self, api_key_client, workspace, project):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")

        response = api_key_client.patch(
            f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/",
            {"name": "Office move 2", "status": "completed", "folder": str(folder.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.name == "Office move 2"
        assert (project.status, project.folder_id, project.reopened_at) == ("backlog", None, None)

    def test_lite_projects_list_carries_status_and_folder(self, session_client, workspace, project):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")
        Project.objects.filter(pk=project.id).update(status="completed", folder=folder)

        response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/")

        assert response.status_code == status.HTTP_200_OK
        row = next(p for p in response.data if str(p["id"]) == str(project.id))
        assert row["status"] == "completed"
        assert str(row["folder"]) == str(folder.id)
        assert row["reopened_at"] is None

    def test_projects_list_carries_status_and_folder(self, session_client, workspace, project):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")
        Project.objects.filter(pk=project.id).update(status="completed", folder=folder)

        response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/details/")

        assert response.status_code == status.HTTP_200_OK
        row = next(p for p in response.data if str(p["id"]) == str(project.id))
        assert row["status"] == "completed"
        assert str(row["folder"]) == str(folder.id)
        assert row["reopened_at"] is None


@pytest.mark.contract
class TestProjectBecomesDoneOnItsOwn:
    def test_closing_the_last_open_work_item_marks_the_project_done(self, project, states):
        first, second = _item(project, states["todo"]), _item(project, states["doing"], "Hire van")

        _move(first, states["done"])
        project.refresh_from_db()
        assert project.status == "backlog"

        _move(second, states["done"])
        project.refresh_from_db()
        assert project.status == "completed"

    def test_deleting_the_last_open_work_item_marks_the_project_done(self, project, states):
        _item(project, states["done"])
        stray = _item(project, states["todo"], "Never happened")

        Issue.objects.get(pk=stray.pk).delete()

        project.refresh_from_db()
        assert project.status == "completed"

    def test_deleting_the_only_work_item_leaves_an_empty_project_alone(self, project, states):
        only = _item(project, states["todo"])

        Issue.objects.get(pk=only.pk).delete()

        project.refresh_from_db()
        assert project.status == "backlog"

    def test_bulk_deleting_the_open_work_items_marks_the_project_done(self, session_client, workspace, project, states):
        _item(project, states["done"])
        strays = [_item(project, states["todo"], f"Stray {n}") for n in range(2)]

        response = session_client.delete(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/bulk-delete-issues/",
            {"issue_ids": [str(item.id) for item in strays]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.status == "completed"

    def test_cancelled_work_items_count_as_closed(self, project, states):
        _item(project, states["done"])
        dropped = _item(project, states["todo"], "Order skip")

        _move(dropped, states["cancelled"])

        project.refresh_from_db()
        assert project.status == "completed"

    def test_pending_intake_items_do_not_hold_the_project_open(self, project, states):
        _item(project, states["triage"], "Request from the form")
        item = _item(project, states["todo"])

        _move(item, states["done"])

        project.refresh_from_db()
        assert project.status == "completed"

    def test_an_empty_project_is_never_done_on_its_own(self, project, states):
        assert complete_project_if_all_done(project.id) is False
        project.refresh_from_db()
        assert project.status == "backlog"

    def test_a_cancelled_project_stays_cancelled(self, project, states):
        item = _item(project, states["todo"])
        Project.objects.filter(pk=project.id).update(status="cancelled")

        _move(item, states["done"])

        project.refresh_from_db()
        assert project.status == "cancelled"

    @pytest.mark.parametrize("open_status", ["backlog", "unstarted", "started"])
    def test_any_open_status_becomes_done(self, project, states, open_status):
        item = _item(project, states["todo"])
        Project.objects.filter(pk=project.id).update(status=open_status)

        _move(item, states["done"])

        project.refresh_from_db()
        assert project.status == "completed"

    def test_through_the_api(self, session_client, workspace, project, states):
        item = _item(project, states["todo"])

        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{item.id}/",
            {"state_id": str(states["done"].id)},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        project.refresh_from_db()
        assert project.status == "completed"


@pytest.mark.contract
class TestNewWorkItemReopensADoneProject:
    @pytest.fixture
    def done_project(self, project, states):
        _item(project, states["done"])
        Project.objects.filter(pk=project.id).update(status="completed")
        return project

    def test_new_work_item_puts_it_back_in_progress_with_a_notice(self, done_project, states):
        _item(done_project, states["todo"], "Forgot the plants")

        done_project.refresh_from_db()
        assert done_project.status == "started"
        assert done_project.reopened_at is not None

    def test_through_the_api(self, session_client, workspace, done_project, states):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{done_project.id}/issues/",
            {"name": "Forgot the plants"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        done_project.refresh_from_db()
        assert done_project.status == "started"
        assert done_project.reopened_at is not None

    def test_restoring_a_deleted_open_work_item_reopens_it(self, done_project, states):
        stray = _item(done_project, states["todo"], "Deleted by mistake")
        Issue.objects.get(pk=stray.pk).delete()
        Project.objects.filter(pk=done_project.id).update(status="completed", reopened_at=None)

        restored = Issue.all_objects.get(pk=stray.pk)
        restored.deleted_at = None
        restored.save()

        done_project.refresh_from_db()
        assert done_project.status == "started"
        assert done_project.reopened_at is not None

    def test_a_work_item_created_already_closed_changes_nothing(self, done_project, states):
        _item(done_project, states["done"], "Logged after the fact")

        done_project.refresh_from_db()
        assert done_project.status == "completed"
        assert done_project.reopened_at is None

    def test_an_intake_request_reopens_only_once_accepted(self, done_project, states):
        request = _item(done_project, states["triage"], "Request from the form")
        done_project.refresh_from_db()
        assert done_project.status == "completed"

        _move(request, states["todo"])

        done_project.refresh_from_db()
        assert done_project.status == "started"
        assert done_project.reopened_at is not None

    def test_moving_an_existing_item_does_not_reopen_a_project_marked_done_by_hand(self, project, states):
        item = _item(project, states["todo"])
        Project.objects.filter(pk=project.id).update(status="completed")

        _move(item, states["doing"])

        project.refresh_from_db()
        assert project.status == "completed"
        assert project.reopened_at is None

    def test_a_new_work_item_leaves_other_statuses_alone(self, project, states):
        Project.objects.filter(pk=project.id).update(status="cancelled")

        _item(project, states["todo"])

        project.refresh_from_db()
        assert project.status == "cancelled"
        assert project.reopened_at is None

    def test_finishing_the_new_work_item_marks_done_again_and_clears_the_notice(self, done_project, states):
        late = _item(done_project, states["todo"], "Forgot the plants")

        _move(late, states["done"])

        done_project.refresh_from_db()
        assert done_project.status == "completed"
        assert done_project.reopened_at is None

    def test_notice_can_be_dismissed(self, session_client, workspace, done_project, states):
        _item(done_project, states["todo"], "Forgot the plants")

        response = session_client.delete(notice_url(workspace.slug, done_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reopened_at"] is None
        done_project.refresh_from_db()
        assert done_project.status == "started"
        assert done_project.reopened_at is None

    def test_setting_the_status_by_hand_clears_the_notice(self, session_client, workspace, done_project, states):
        _item(done_project, states["todo"], "Forgot the plants")

        session_client.post(status_url(workspace.slug, done_project.id), {"status": "unstarted"}, format="json")

        done_project.refresh_from_db()
        assert done_project.status == "unstarted"
        assert done_project.reopened_at is None


@pytest.mark.contract
class TestProjectFolders:
    def test_create_and_list_in_creation_order(self, session_client, workspace):
        for name in ["Clients", "Internal"]:
            response = session_client.post(folders_url(workspace.slug), {"name": f"  {name} "}, format="json")
            assert response.status_code == status.HTTP_201_CREATED
            assert response.data["name"] == name

        response = session_client.get(folders_url(workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        assert [folder["name"] for folder in response.data] == ["Clients", "Internal"]

    @pytest.mark.parametrize("role", [20, 15, 5])
    def test_any_workspace_role_may_create(self, workspace, role):
        response = _client(workspace, role).post(folders_url(workspace.slug), {"name": "Clients"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED

    def test_outsider_is_refused(self, workspace):
        client = _client()

        assert client.get(folders_url(workspace.slug)).status_code == status.HTTP_403_FORBIDDEN
        assert (
            client.post(folders_url(workspace.slug), {"name": "Clients"}, format="json").status_code
            == status.HTTP_403_FORBIDDEN
        )

    @pytest.mark.parametrize("name", ["", "   ", "x" * 256])
    def test_bad_names_are_refused(self, session_client, workspace, name):
        response = session_client.post(folders_url(workspace.slug), {"name": name}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_duplicate_name_is_refused_whatever_the_case(self, session_client, workspace):
        ProjectFolder.objects.create(workspace=workspace, name="Clients")

        response = session_client.post(folders_url(workspace.slug), {"name": "clients"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_same_name_in_another_workspace_is_fine(self, session_client, workspace, other_workspace):
        ProjectFolder.objects.create(workspace=other_workspace, name="Clients")

        response = session_client.post(folders_url(workspace.slug), {"name": "Clients"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED

    def test_rename(self, session_client, workspace):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")
        ProjectFolder.objects.create(workspace=workspace, name="Internal")

        renamed = session_client.patch(folders_url(workspace.slug, folder.id), {"name": "Customers"}, format="json")
        same = session_client.patch(folders_url(workspace.slug, folder.id), {"name": "customers"}, format="json")
        clash = session_client.patch(folders_url(workspace.slug, folder.id), {"name": "Internal"}, format="json")

        assert renamed.status_code == status.HTTP_200_OK
        assert same.status_code == status.HTTP_200_OK
        assert clash.status_code == status.HTTP_400_BAD_REQUEST
        folder.refresh_from_db()
        assert folder.name == "customers"

    def test_move_a_project_in_and_out(self, session_client, workspace, project):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")

        moved = session_client.post(assign_url(workspace.slug, project.id), {"folder": str(folder.id)}, format="json")
        project.refresh_from_db()
        assert moved.status_code == status.HTTP_200_OK
        assert project.folder_id == folder.id

        removed = session_client.post(assign_url(workspace.slug, project.id), {"folder": None}, format="json")
        project.refresh_from_db()
        assert removed.status_code == status.HTTP_200_OK
        assert project.folder_id is None

    def test_cannot_use_a_folder_of_another_workspace(self, session_client, workspace, project, other_workspace):
        foreign = ProjectFolder.objects.create(workspace=other_workspace, name="Clients")

        response = session_client.post(
            assign_url(workspace.slug, project.id), {"folder": str(foreign.id)}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        project.refresh_from_db()
        assert project.folder_id is None

    def test_deleting_a_folder_keeps_its_projects(self, session_client, workspace, project):
        folder = ProjectFolder.objects.create(workspace=workspace, name="Clients")
        Project.objects.filter(pk=project.id).update(folder=folder)

        response = session_client.delete(folders_url(workspace.slug, folder.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectFolder.objects.filter(pk=folder.id).exists()
        project.refresh_from_db()
        assert project.folder_id is None
        assert session_client.get(folders_url(workspace.slug)).data == []

    def test_folder_of_another_workspace_cannot_be_renamed_or_deleted(self, session_client, workspace, other_workspace):
        foreign = ProjectFolder.objects.create(workspace=other_workspace, name="Clients")

        renamed = session_client.patch(folders_url(workspace.slug, foreign.id), {"name": "Mine"}, format="json")
        deleted = session_client.delete(folders_url(workspace.slug, foreign.id))

        assert renamed.status_code == status.HTTP_404_NOT_FOUND
        assert deleted.status_code == status.HTTP_404_NOT_FOUND
        foreign.refresh_from_db()
        assert foreign.name == "Clients"
