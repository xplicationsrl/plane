# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging

# Third party imports
from celery import shared_task

# Django imports
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.db.models import Issue, IssueRecurrence, State, StateGroup
from plane.utils.exception_logger import log_exception
from plane.utils.issue_copy import copy_issue
from plane.utils.recurrence import next_due_date

logger = logging.getLogger("plane.worker")

# A rule whose spawn keeps failing is switched off instead of retried every sweep forever
MAX_CONSECUTIVE_FAILURES = 5
FAILURE_WINDOW = 60 * 60 * 24


def _next_dates(issue, recurrence, today):
    """New (start_date, target_date) for the next occurrence, or None when the rule has ended."""
    following = next_due_date(recurrence, issue, today)
    if following is None:
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
            .select_related("issue", "issue__state", "issue__project")
            .first()
        )
        if recurrence is None:
            return None
        issue = recurrence.issue
        if issue.deleted_at or issue.archived_at or issue.project.archived_at or issue.project.deleted_at:
            return None
        if issue.state is None or issue.state.group != StateGroup.COMPLETED.value:
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


def _failure_key(recurrence_id):
    return f"recurrence_spawn_failures:{recurrence_id}"


def _record_failure(recurrence_id):
    """Count a failed spawn; deactivate the rule after too many in a row."""
    try:
        key = _failure_key(recurrence_id)
        cache.add(key, 0, timeout=FAILURE_WINDOW)
        failures = cache.incr(key)
        if failures >= MAX_CONSECUTIVE_FAILURES:
            IssueRecurrence.objects.filter(pk=recurrence_id).update(is_active=False, updated_at=timezone.now())
            cache.delete(key)
            logger.warning("Deactivated recurrence %s after %s consecutive failed spawns", recurrence_id, failures)
    except Exception as e:
        log_exception(e)


def spawn_safely(recurrence_id):
    """``spawn_for_recurrence`` that logs failures and stops retrying a rule that keeps failing."""
    try:
        spawn_for_recurrence(recurrence_id)
    except Exception as e:
        log_exception(e)
        _record_failure(recurrence_id)
        return
    try:
        cache.delete(_failure_key(recurrence_id))
    except Exception as e:
        log_exception(e)


@shared_task
def spawn_next_occurrence(issue_id):
    try:
        recurrence = IssueRecurrence.objects.filter(issue_id=issue_id, is_active=True).first()
    except Exception as e:
        log_exception(e)
        return
    if recurrence:
        spawn_safely(recurrence.id)


@shared_task
def spawn_due_recurrences():
    """Catch completions that skipped the save signal (bulk updates, imports)."""
    due = IssueRecurrence.objects.filter(
        is_active=True,
        issue__state__group=StateGroup.COMPLETED.value,
        issue__deleted_at__isnull=True,
        issue__archived_at__isnull=True,
        issue__project__archived_at__isnull=True,
        issue__project__deleted_at__isnull=True,
    ).values_list("id", flat=True)
    for recurrence_id in due:
        spawn_safely(recurrence_id)
