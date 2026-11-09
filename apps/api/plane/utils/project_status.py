# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The project status and how work items move it.

A project has a status like a work item's state group: backlog, unstarted (todo), started
(in progress), completed (done) or cancelled. People set it by hand; on top of that a project
becomes done on its own once every work item in it is closed, and a new open work item in a
done project puts it back in progress and leaves a notice.

Everything here writes with ``QuerySet.update()`` so it is safe to call from ``Issue.save()``:
no ``Project.save()`` side effects, and the filter makes each call a no-op when there is
nothing to change.
"""

# Django imports
from django.utils import timezone

OPEN_STATE_GROUPS = ("backlog", "unstarted", "started")
CLOSED_STATE_GROUPS = ("completed", "cancelled")
TRIAGE_STATE_GROUP = "triage"

PROJECT_STATUS_DONE = "completed"
PROJECT_STATUS_IN_PROGRESS = "started"
# A cancelled project is left alone by the automatic rules.
PROJECT_OPEN_STATUSES = OPEN_STATE_GROUPS
PROJECT_STATUSES = OPEN_STATE_GROUPS + CLOSED_STATE_GROUPS


def set_project_status(project_id, status):
    """Set the status by hand. Clears the "reopened" notice: whoever does this has seen the project."""
    from plane.db.models import Project

    return Project.objects.filter(pk=project_id).update(status=status, reopened_at=None)


def reopen_project_for_new_work_item(project_id):
    """A new open work item landed in the project: if it was done, put it back in progress with a notice."""
    from plane.db.models import Project

    return Project.objects.filter(pk=project_id, status=PROJECT_STATUS_DONE).update(
        status=PROJECT_STATUS_IN_PROGRESS, reopened_at=timezone.now()
    )


def complete_project_if_all_done(project_id):
    """Mark the project done when it has work items and none of them is open.

    Pending intake (triage) and draft items don't count either way; an empty project is never
    done on its own. Returns True when the project was marked done by this call.
    """
    from plane.db.models import Issue, Project

    work_items = Issue.objects.filter(project_id=project_id, is_draft=False).exclude(state__group=TRIAGE_STATE_GROUP)
    if work_items.filter(state__group__in=OPEN_STATE_GROUPS).exists():
        return False
    if not work_items.exists():
        return False
    return bool(
        Project.objects.filter(pk=project_id, status__in=PROJECT_OPEN_STATUSES, archived_at__isnull=True).update(
            status=PROJECT_STATUS_DONE, reopened_at=None
        )
    )
