# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import IssueTimeEntry

# A single entry can't exceed a day; longer work is logged across days.
MAX_ENTRY_SECONDS = 24 * 60 * 60


def stop_timer(entry, now=None):
    """Finish a running timer, capping it at a day so a forgotten timer stays sane."""
    now = now or timezone.now()
    elapsed = int((now - entry.started_at).total_seconds())
    entry.ended_at = now
    entry.duration_seconds = max(1, min(elapsed, MAX_ENTRY_SECONDS))
    entry.save(update_fields=["ended_at", "duration_seconds", "updated_at"])
    return entry


def stop_timers_on_removal(user_id, **scope):
    """Stop what ``user_id`` has running in the ``scope`` they just lost access to, keeping the time so far."""
    running = IssueTimeEntry.objects.filter(user_id=user_id, started_at__isnull=False, ended_at__isnull=True, **scope)
    for entry in running:
        stop_timer(entry)
