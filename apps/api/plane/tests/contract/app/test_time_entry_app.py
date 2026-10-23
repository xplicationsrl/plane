# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for time tracking on work items."""

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueTimeEntry, Project, ProjectMember, User, WorkspaceMember


def entries_url(slug, project_id, issue_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/time-entries/"
    return f"{base}{pk}/" if pk else base


def running_url(slug):
    return f"/api/workspaces/{slug}/time-entries/running/"


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
        name="Timed", identifier=f"T{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def issue(db, workspace, project):
    return Issue.objects.create(name="Billable", project=project, workspace=workspace)


@pytest.mark.contract
class TestManualTimeEntries:
    def test_log_time_and_read_total(self, session_client, workspace, project, issue):
        url = entries_url(workspace.slug, project.id, issue.id)
        first = session_client.post(url, {"duration_seconds": 1800, "logged_on": "2026-10-20"}, format="json")
        session_client.post(
            url, {"duration_seconds": 3600, "logged_on": "2026-10-21", "description": "QA"}, format="json"
        )

        response = session_client.get(url)

        assert first.status_code == status.HTTP_201_CREATED
        assert response.data["total_seconds"] == 5400
        assert [e["duration_seconds"] for e in response.data["entries"]] == [3600, 1800]

    @pytest.mark.parametrize("duration", [0, -5, 24 * 3600 + 1])
    def test_rejects_out_of_range_durations(self, session_client, workspace, project, issue, duration):
        response = session_client.post(
            entries_url(workspace.slug, project.id, issue.id),
            {"duration_seconds": duration, "logged_on": "2026-10-20"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_duration_is_required_for_manual_entries(self, session_client, workspace, project, issue):
        response = session_client.post(
            entries_url(workspace.slug, project.id, issue.id), {"logged_on": "2026-10-20"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_member_cannot_edit_someone_elses_entry_but_admin_can(self, session_client, workspace, project, issue):
        entry = session_client.post(
            entries_url(workspace.slug, project.id, issue.id),
            {"duration_seconds": 600, "logged_on": "2026-10-20"},
            format="json",
        ).data
        _, member = _member(workspace, project, role=15)

        denied = member.delete(entries_url(workspace.slug, project.id, issue.id, entry["id"]))
        allowed = session_client.patch(
            entries_url(workspace.slug, project.id, issue.id, entry["id"]), {"duration_seconds": 900}, format="json"
        )

        assert denied.status_code == status.HTTP_404_NOT_FOUND
        assert allowed.status_code == status.HTTP_200_OK
        assert allowed.data["duration_seconds"] == 900

    def test_guest_cannot_log_time(self, workspace, project, issue):
        _, guest = _member(workspace, project, role=5)
        response = guest.post(
            entries_url(workspace.slug, project.id, issue.id),
            {"duration_seconds": 600, "logged_on": "2026-10-20"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_issue_from_another_project_is_not_found(self, session_client, workspace, project, create_user):
        other = Project.objects.create(name="Other", identifier="OTX", workspace=workspace, created_by=create_user)
        foreign = Issue.objects.create(name="Elsewhere", project=other, workspace=workspace)
        response = session_client.get(entries_url(workspace.slug, project.id, foreign.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestTimers:
    def test_start_and_stop_a_timer(self, session_client, workspace, project, issue):
        url = entries_url(workspace.slug, project.id, issue.id)
        started = session_client.post(url, {"timer": "start"}, format="json")
        assert started.status_code == status.HTTP_201_CREATED
        entry_id = started.data["entry"]["id"]
        assert started.data["entry"]["is_running"] is True

        # The running timer is not part of the total yet
        assert session_client.get(url).data["total_seconds"] == 0
        assert str(session_client.get(running_url(workspace.slug)).data["id"]) == str(entry_id)

        IssueTimeEntry.objects.filter(pk=entry_id).update(started_at=timezone.now() - timedelta(minutes=25))
        stopped = session_client.patch(
            entries_url(workspace.slug, project.id, issue.id, entry_id), {"stop": True}, format="json"
        )

        assert stopped.status_code == status.HTTP_200_OK
        assert 25 * 60 <= stopped.data["duration_seconds"] < 26 * 60
        assert session_client.get(running_url(workspace.slug)).data is None

    def test_starting_a_second_timer_stops_the_first(self, session_client, workspace, project, issue):
        other_issue = Issue.objects.create(name="Next", project=project, workspace=workspace)
        first = session_client.post(
            entries_url(workspace.slug, project.id, issue.id), {"timer": "start"}, format="json"
        )

        second = session_client.post(
            entries_url(workspace.slug, project.id, other_issue.id), {"timer": "start"}, format="json"
        )

        assert second.status_code == status.HTTP_201_CREATED
        assert str(second.data["stopped"]["id"]) == str(first.data["entry"]["id"])
        running = IssueTimeEntry.objects.filter(started_at__isnull=False, ended_at__isnull=True)
        assert running.count() == 1
        assert running.first().issue_id == other_issue.id

    def test_forgotten_timer_is_capped_at_a_day(self, session_client, workspace, project, issue):
        url = entries_url(workspace.slug, project.id, issue.id)
        entry_id = session_client.post(url, {"timer": "start"}, format="json").data["entry"]["id"]
        IssueTimeEntry.objects.filter(pk=entry_id).update(started_at=timezone.now() - timedelta(days=3))

        stopped = session_client.patch(
            entries_url(workspace.slug, project.id, issue.id, entry_id), {"stop": True}, format="json"
        )

        assert stopped.data["duration_seconds"] == 24 * 3600

    def test_cannot_edit_duration_of_running_timer(self, session_client, workspace, project, issue):
        url = entries_url(workspace.slug, project.id, issue.id)
        entry_id = session_client.post(url, {"timer": "start"}, format="json").data["entry"]["id"]

        response = session_client.patch(
            entries_url(workspace.slug, project.id, issue.id, entry_id), {"duration_seconds": 60}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
