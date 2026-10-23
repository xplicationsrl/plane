# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for one-level comment threads (replies) on work items."""

from unittest import mock
from uuid import uuid4

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueComment, Project, ProjectMember


def comments_url(slug, project_id, issue_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/comments/"
    return f"{base}{pk}/" if pk else base


@pytest.fixture(autouse=True)
def _no_activity(db):
    with (
        mock.patch("plane.app.views.issue.comment.issue_activity"),
        mock.patch("plane.app.views.issue.comment.model_activity"),
        mock.patch("plane.app.views.issue.comment.base_host", return_value="http://testserver"),
        mock.patch("plane.db.mixins.soft_delete_related_objects"),
    ):
        yield


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Replies", identifier=f"R{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def issue(db, workspace, project):
    return Issue.objects.create(name="Thread host", project=project, workspace=workspace)


def _post(client, workspace, project, issue, html, parent_id=None):
    payload = {"comment_html": html}
    if parent_id:
        payload["parent_id"] = str(parent_id)
    return client.post(comments_url(workspace.slug, project.id, issue.id), payload, format="json")


@pytest.mark.contract
class TestCommentReplies:
    def test_reply_is_linked_to_parent(self, session_client, workspace, project, issue):
        root = _post(session_client, workspace, project, issue, "<p>root</p>")
        assert root.status_code == status.HTTP_201_CREATED

        reply = _post(session_client, workspace, project, issue, "<p>reply</p>", root.data["id"])
        assert reply.status_code == status.HTTP_201_CREATED
        assert str(reply.data["parent"]) == str(root.data["id"])

    def test_reply_to_reply_attaches_to_thread_root(self, session_client, workspace, project, issue):
        root = _post(session_client, workspace, project, issue, "<p>root</p>")
        reply = _post(session_client, workspace, project, issue, "<p>reply</p>", root.data["id"])
        nested = _post(session_client, workspace, project, issue, "<p>nested</p>", reply.data["id"])

        assert nested.status_code == status.HTTP_201_CREATED
        assert str(nested.data["parent"]) == str(root.data["id"])

    def test_parent_from_another_issue_is_rejected(self, session_client, workspace, project, issue):
        other_issue = Issue.objects.create(name="Other", project=project, workspace=workspace)
        foreign = _post(session_client, workspace, project, other_issue, "<p>elsewhere</p>")

        response = _post(session_client, workspace, project, issue, "<p>reply</p>", foreign.data["id"])

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not IssueComment.objects.filter(issue=issue).exists()

    def test_malformed_parent_is_rejected(self, session_client, workspace, project, issue):
        response = _post(session_client, workspace, project, issue, "<p>reply</p>", "not-a-uuid")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_deleting_root_deletes_replies(self, session_client, workspace, project, issue):
        root = _post(session_client, workspace, project, issue, "<p>root</p>")
        reply = _post(session_client, workspace, project, issue, "<p>reply</p>", root.data["id"])

        response = session_client.delete(comments_url(workspace.slug, project.id, issue.id, root.data["id"]))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueComment.objects.filter(pk=reply.data["id"]).exists()
