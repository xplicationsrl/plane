# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class IssueTimeEntry(ProjectBaseModel):
    """Time a person spent on a work item.

    A running timer has ``started_at`` set and ``ended_at`` empty; stopping it fills
    ``ended_at`` and ``duration_seconds``. Manually logged time only has
    ``duration_seconds``. ``logged_on`` is the day the time counts for.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="time_entries")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="time_entries")
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    logged_on = models.DateField()
    description = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            # A person runs at most one timer at a time, across all work items
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(started_at__isnull=False, ended_at__isnull=True, deleted_at__isnull=True),
                name="issue_time_entry_one_running_timer_per_user",
            )
        ]
        indexes = [models.Index(fields=["issue", "logged_on"], name="time_entry_issue_logged_on_idx")]
        verbose_name = "Issue Time Entry"
        verbose_name_plural = "Issue Time Entries"
        db_table = "issue_time_entries"
        ordering = ("-logged_on", "-created_at")

    @property
    def is_running(self):
        return self.started_at is not None and self.ended_at is None

    def __str__(self):
        return f"{self.issue_id} - {self.user_id} - {self.duration_seconds}s"
