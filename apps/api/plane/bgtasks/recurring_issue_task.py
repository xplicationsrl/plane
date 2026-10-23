# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging

# Third party imports
from celery import shared_task

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.db.models import Issue, IssueRecurrence, State, StateGroup
from plane.utils.exception_logger import log_exception
from plane.utils.issue_copy import copy_issue
from plane.utils.recurrence import next_occurrence

logger = logging.getLogger("plane.worker")


def _next_dates(issue, recurrence, today):
    """New (start_date, target_date) for the next occurrence, or None when the rule has ended.

    The schedule follows the due date (or the start date when there is none) and skips
    ahead past today, so a task completed late doesn't come back already overdue.
    """
    base = issue.target_date or issue.start_date or today
    following = next_occurrence(
        base, recurrence.frequency, recurrence.interval, recurrence.weekdays, recurrence.anchor_day
    )
    while following < today:
        following = next_occurrence(
            following, recurrence.frequency, recurrence.interval, recurrence.weekdays, recurrence.anchor_day
        )
    if recurrence.ends_on and following > recurrence.ends_on:
        return None
    if issue.target_date:
        start = issue.start_date + (following - issue.target_date) if issue.start_date else None
        return start, following
    if issue.start_date:
        return following, None
    return None, following


def reopen_state_id(project_id):
    """The project's default state, or its first open one if the default counts as done."""
    states = State.objects.filter(project_id=project_id).exclude(
        group__in=[StateGroup.COMPLETED.value, StateGroup.CANCELLED.value, StateGroup.TRIAGE.value]
    )
    default = states.filter(default=True).first()
    return (default or states.order_by("sequence").first() or State(id=None)).id


def spawn_for_recurrence(recurrence_id):
    """Create the next occurrence if the current one is completed. Returns the new issue or None."""
    with transaction.atomic():
        recurrence = (
            IssueRecurrence.objects.select_for_update(of=("self",))
            .filter(pk=recurrence_id, is_active=True)
            .select_related("issue", "issue__state")
            .first()
        )
        if recurrence is None:
            return None
        issue = recurrence.issue
        if issue.deleted_at or issue.state is None or issue.state.group != StateGroup.COMPLETED.value:
            return None

        dates = _next_dates(issue, recurrence, timezone.localdate())
        if dates is None:
            recurrence.is_active = False
            recurrence.save(update_fields=["is_active", "updated_at"])
            return None

        actor_id = recurrence.created_by_id
        state_id = reopen_state_id(issue.project_id)
        new_issue = copy_issue(issue, actor_id=actor_id, start_date=dates[0], target_date=dates[1], state_id=state_id)
        # Sub-work items come along, reopened, without dates
        for child in Issue.issue_objects.filter(parent=issue):
            copy_issue(
                child, actor_id=actor_id, parent_id=new_issue.id, start_date=None, target_date=None, state_id=state_id
            )

        recurrence.issue = new_issue
        recurrence.occurrences += 1
        recurrence.last_spawned_at = timezone.now()
        recurrence.save(update_fields=["issue", "occurrences", "last_spawned_at", "updated_at"])
        return new_issue


@shared_task
def spawn_next_occurrence(issue_id):
    try:
        recurrence = IssueRecurrence.objects.filter(issue_id=issue_id, is_active=True).first()
        if recurrence:
            spawn_for_recurrence(recurrence.id)
    except Exception as e:
        log_exception(e)


@shared_task
def spawn_due_recurrences():
    """Catch completions that skipped the save signal (bulk updates, imports)."""
    due = IssueRecurrence.objects.filter(
        is_active=True, issue__state__group=StateGroup.COMPLETED.value, issue__deleted_at__isnull=True
    ).values_list("id", flat=True)
    for recurrence_id in due:
        try:
            spawn_for_recurrence(recurrence_id)
        except Exception as e:
            log_exception(e)
