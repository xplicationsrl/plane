# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for recurring work items."""

from datetime import timedelta
from unittest import mock
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status

from plane.bgtasks.recurring_issue_task import spawn_due_recurrences, spawn_for_recurrence
from plane.db.models import (
    CustomProperty,
    Issue,
    IssueAssignee,
    IssueCustomPropertyValue,
    IssueRecurrence,
    Label,
    IssueLabel,
    Project,
    ProjectMember,
    State,
)


def recurrence_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/recurrence/"


@pytest.fixture(autouse=True)
def _no_broker():
    # The save signal queues the spawn on commit; tests call it directly instead.
    with mock.patch("plane.bgtasks.recurring_issue_task.spawn_next_occurrence.delay"):
        yield


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Routines", identifier=f"R{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(name="Todo", group="unstarted", project=project, default=True, sequence=1)
    State.objects.create(name="Done", group="completed", project=project, sequence=2)
    return project


@pytest.fixture
def issue(db, workspace, project, create_user):
    future = timezone.localdate() + timedelta(days=2)
    issue = Issue.objects.create(
        name="Weekly report",
        project=project,
        workspace=workspace,
        start_date=future - timedelta(days=1),
        target_date=future,
        priority="high",
        created_by=create_user,
    )
    IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project)
    return issue


def _complete(issue):
    issue.state = State.objects.get(project=issue.project, group="completed")
    issue.save()


@pytest.mark.contract
class TestRecurrenceApi:
    def test_set_read_and_remove_a_rule(self, session_client, workspace, project, issue):
        url = recurrence_url(workspace.slug, project.id, issue.id)

        created = session_client.put(url, {"frequency": "weekly", "interval": 1, "weekdays": [4, 0, 4]}, format="json")
        read = session_client.get(url)
        removed = session_client.delete(url)

        assert created.status_code == status.HTTP_200_OK
        assert created.data["weekdays"] == [0, 4]
        assert read.data["frequency"] == "weekly"
        assert removed.status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(url).data is None

    def test_weekdays_are_dropped_for_non_weekly_rules(self, session_client, workspace, project, issue):
        response = session_client.put(
            recurrence_url(workspace.slug, project.id, issue.id),
            {"frequency": "monthly", "weekdays": [1]},
            format="json",
        )
        assert response.data["weekdays"] == []

    @pytest.mark.parametrize(
        "payload",
        [{"frequency": "hourly"}, {"frequency": "daily", "interval": 0}, {"frequency": "weekly", "weekdays": [7]}],
    )
    def test_invalid_rules_are_rejected(self, session_client, workspace, project, issue, payload):
        response = session_client.put(recurrence_url(workspace.slug, project.id, issue.id), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_next_due_on_preview(self, session_client, workspace, project, issue):
        response = session_client.put(
            recurrence_url(workspace.slug, project.id, issue.id), {"frequency": "daily", "interval": 2}, format="json"
        )
        assert response.data["next_due_on"] == (issue.target_date + timedelta(days=2)).isoformat()


@pytest.mark.contract
class TestNextOccurrence:
    def _rule(self, issue, create_user, **kwargs):
        return IssueRecurrence.objects.create(
            issue=issue,
            project=issue.project,
            frequency=kwargs.pop("frequency", "weekly"),
            anchor_day=issue.target_date.day,
            created_by=create_user,
            **kwargs,
        )

    def test_completing_creates_the_next_occurrence_with_shifted_dates(self, issue, create_user, project, workspace):
        label = Label.objects.create(name="ops", project=project, workspace=workspace)
        IssueLabel.objects.create(issue=issue, label=label, project=project)
        prop = CustomProperty.objects.create(name="Effort", property_type="number", project=project)
        IssueCustomPropertyValue.objects.create(issue=issue, property=prop, value=3, project=project)
        child = Issue.objects.create(name="Gather numbers", parent=issue, project=project, workspace=workspace)
        rule = self._rule(issue, create_user)
        _complete(issue)

        new_issue = spawn_for_recurrence(rule.id)

        assert new_issue is not None
        assert new_issue.target_date == issue.target_date + timedelta(weeks=1)
        assert new_issue.start_date == issue.start_date + timedelta(weeks=1)
        assert new_issue.state.group == "unstarted"
        assert new_issue.priority == "high"
        assert list(new_issue.assignees.all()) == [create_user]
        assert list(new_issue.labels.all()) == [label]
        assert IssueCustomPropertyValue.objects.get(issue=new_issue).value == 3
        assert Issue.objects.filter(parent=new_issue, name=child.name).exists()
        rule.refresh_from_db()
        assert rule.issue_id == new_issue.id
        assert rule.occurrences == 2

    def test_open_occurrence_does_not_spawn(self, issue, create_user):
        rule = self._rule(issue, create_user)
        assert spawn_for_recurrence(rule.id) is None

    def test_spawning_is_idempotent(self, issue, create_user, project):
        rule = self._rule(issue, create_user)
        _complete(issue)

        spawn_for_recurrence(rule.id)
        spawn_for_recurrence(rule.id)

        assert Issue.objects.filter(project=project, name=issue.name).count() == 2

    def test_rule_ends_after_its_end_date(self, issue, create_user, project):
        rule = self._rule(issue, create_user, ends_on=issue.target_date + timedelta(days=3))
        _complete(issue)

        assert spawn_for_recurrence(rule.id) is None
        rule.refresh_from_db()
        assert rule.is_active is False

    def test_late_completion_skips_past_occurrences(self, issue, create_user):
        issue.start_date = None
        issue.target_date = timezone.localdate() - timedelta(days=10)
        issue.save()
        rule = self._rule(issue, create_user, frequency="daily")
        _complete(issue)

        new_issue = spawn_for_recurrence(rule.id)

        assert new_issue.target_date >= timezone.localdate()

    def test_sweep_catches_bulk_completions(self, issue, create_user, project):
        self._rule(issue, create_user)
        Issue.objects.filter(pk=issue.pk).update(state=State.objects.get(project=project, group="completed"))

        spawn_due_recurrences()

        assert Issue.objects.filter(project=project, name=issue.name).count() == 2

    def test_saving_a_completion_queues_the_spawn(self, issue, create_user):
        self._rule(issue, create_user)
        with (
            mock.patch("plane.bgtasks.recurring_issue_task.spawn_next_occurrence.delay") as delay,
            mock.patch("django.db.transaction.on_commit", side_effect=lambda fn: fn()),
        ):
            _complete(issue)
        delay.assert_called_once_with(str(issue.id))
