# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for work item colors, the done/color/name sorts and sub-work item reordering."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Project, ProjectMember, State, User, Workspace, WorkspaceMember
from plane.utils.issue_copy import copy_issue
from plane.utils.order_queryset import COLOR_ORDER


def _user(workspace, project, role=20):
    user = User.objects.create(email=f"u-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.fixture
def setup(db):
    owner = User.objects.create(email=f"o-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    workspace = Workspace.objects.create(name="W", slug=f"w-{uuid4().hex[:8]}", owner=owner)
    project = Project.objects.create(
        name="P", identifier=uuid4().hex[:5].upper(), workspace=workspace, created_by=owner
    )
    states = {
        group: State.objects.create(name=group, group=group, project=project, default=group == "backlog")
        for group in ["backlog", "unstarted", "started", "completed", "cancelled"]
    }
    user, client = _user(workspace, project)
    return workspace, project, states, user, client


def _issue(project, state, name="x", **fields):
    return Issue.objects.create(project=project, workspace=project.workspace, state=state, name=name, **fields)


def _list_names(client, workspace, project, order_by):
    response = client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/", {"order_by": order_by})
    assert response.status_code == status.HTTP_200_OK
    return [issue["name"] for issue in response.data["results"]]


def _reorder_url(workspace, project, parent):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{parent.id}/sub-issues/reorder/"


@pytest.mark.contract
class TestWorkItemColor:
    def _url(self, workspace, project, issue):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/"

    def test_set_and_clear(self, setup):
        workspace, project, states, _, client = setup
        issue = _issue(project, states["backlog"])

        response = client.patch(self._url(workspace, project, issue), {"color_code": "teal"}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.color_code == "teal"
        assert client.get(self._url(workspace, project, issue)).data["color_code"] == "teal"

        response = client.patch(self._url(workspace, project, issue), {"color_code": None}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.color_code is None

    def test_rejects_a_color_outside_the_palette(self, setup):
        workspace, project, states, _, client = setup
        issue = _issue(project, states["backlog"])

        response = client.patch(self._url(workspace, project, issue), {"color_code": "#ff0000"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        issue.refresh_from_db()
        assert issue.color_code is None

    def test_returned_in_lists_and_sub_issues(self, setup):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"], color_code="pink")
        _issue(project, states["backlog"], parent=parent, color_code="blue")
        base = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"

        listed = client.get(base).data["results"]
        assert {issue["color_code"] for issue in listed} == {"pink", "blue"}
        sub_issues = client.get(f"{base}{parent.id}/sub-issues/").data["sub_issues"]
        assert [issue["color_code"] for issue in sub_issues] == ["blue"]

    def test_palette_matches_the_sort_order(self):
        assert [key for key, _ in Issue.COLOR_CHOICES] == COLOR_ORDER

    def test_copies_keep_the_color(self, setup):
        _, project, states, user, _ = setup
        source = _issue(project, states["backlog"], color_code="green")

        assert copy_issue(source, actor_id=user.id, state_id=states["backlog"].id).color_code == "green"


@pytest.mark.contract
class TestWorkItemSorts:
    def test_done_last_and_done_first(self, setup):
        workspace, project, states, _, client = setup
        for group in ["completed", "backlog", "cancelled", "started", "unstarted"]:
            _issue(project, states[group], name=group)

        assert _list_names(client, workspace, project, "state__group") == [
            "backlog",
            "unstarted",
            "started",
            "completed",
            "cancelled",
        ]
        assert _list_names(client, workspace, project, "-state__group") == [
            "completed",
            "cancelled",
            "started",
            "unstarted",
            "backlog",
        ]

    def test_color_follows_the_palette_with_uncolored_last(self, setup):
        workspace, project, states, _, client = setup
        _issue(project, states["backlog"], name="none")
        _issue(project, states["backlog"], name="blue", color_code="blue")
        _issue(project, states["backlog"], name="red", color_code="red")

        assert _list_names(client, workspace, project, "color_code") == ["red", "blue", "none"]
        assert _list_names(client, workspace, project, "-color_code") == ["blue", "red", "none"]

    def test_name_ignores_case(self, setup):
        workspace, project, states, _, client = setup
        for name in ["beta", "Alpha", "Gamma"]:
            _issue(project, states["backlog"], name=name)

        assert _list_names(client, workspace, project, "name") == ["Alpha", "beta", "Gamma"]
        assert _list_names(client, workspace, project, "-name") == ["Gamma", "beta", "Alpha"]


@pytest.mark.contract
class TestSubIssueReorder:
    def _children(self, project, state, parent, sort_orders):
        children = [_issue(project, state, name=f"c{i}", parent=parent) for i in range(len(sort_orders))]
        for child, sort_order in zip(children, sort_orders):
            Issue.objects.filter(pk=child.pk).update(sort_order=sort_order)
            child.refresh_from_db()
        return children

    def test_reorders_using_the_existing_values(self, setup):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"])
        a, b, c = self._children(project, states["backlog"], parent, [100, 200, 300])

        response = client.post(
            _reorder_url(workspace, project, parent),
            {"sub_issue_ids": [str(c.id), str(a.id), str(b.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["sort_orders"] == {str(c.id): 100, str(a.id): 200, str(b.id): 300}
        c.refresh_from_db()
        assert c.sort_order == 100

    def test_separates_tied_siblings(self, setup):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"])
        a, b, c = self._children(project, states["backlog"], parent, [65535, 65535, 65535])

        response = client.post(
            _reorder_url(workspace, project, parent),
            {"sub_issue_ids": [str(b.id), str(c.id), str(a.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        orders = response.data["sort_orders"]
        assert orders[str(b.id)] < orders[str(c.id)] < orders[str(a.id)]

    def test_does_not_count_as_an_edit(self, setup):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"])
        a, b = self._children(project, states["backlog"], parent, [100, 200])
        updated_at = a.updated_at

        client.post(_reorder_url(workspace, project, parent), {"sub_issue_ids": [str(b.id), str(a.id)]}, format="json")

        a.refresh_from_db()
        assert a.sort_order == 200
        assert a.updated_at == updated_at

    def test_rejects_items_of_another_parent(self, setup):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"])
        other_parent = _issue(project, states["backlog"])
        mine = _issue(project, states["backlog"], parent=parent)
        theirs = _issue(project, states["backlog"], parent=other_parent)
        before = Issue.objects.get(pk=theirs.pk).sort_order

        response = client.post(
            _reorder_url(workspace, project, parent), {"sub_issue_ids": [str(mine.id), str(theirs.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert Issue.objects.get(pk=theirs.pk).sort_order == before

    @pytest.mark.parametrize("payload", [{}, {"sub_issue_ids": []}, {"sub_issue_ids": ["nope"]}])
    def test_rejects_bad_ids(self, setup, payload):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"])

        response = client.post(_reorder_url(workspace, project, parent), payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_duplicate_ids(self, setup):
        workspace, project, states, _, client = setup
        parent = _issue(project, states["backlog"])
        child = _issue(project, states["backlog"], parent=parent)

        response = client.post(
            _reorder_url(workspace, project, parent), {"sub_issue_ids": [str(child.id), str(child.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_guests_cannot_reorder(self, setup):
        workspace, project, states, _, _ = setup
        parent = _issue(project, states["backlog"])
        child = _issue(project, states["backlog"], parent=parent)
        _, guest = _user(workspace, project, role=5)

        response = guest.post(
            _reorder_url(workspace, project, parent), {"sub_issue_ids": [str(child.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
