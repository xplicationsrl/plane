# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models, transaction
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver

# Module imports
from .issue import Issue
from .project import ProjectBaseModel


class RecurrenceFrequency(models.TextChoices):
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"
    YEARLY = "yearly", "Yearly"


class IssueRecurrence(ProjectBaseModel):
    """Makes a work item repeat: completing it creates the next occurrence.

    The rule always points at the current (open) occurrence; when that is completed a
    copy is created with its dates moved to the next occurrence and the rule moves to
    the copy. ``weekdays`` (0 = Monday … 6 = Sunday) only applies to weekly rules.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="recurrences")
    frequency = models.CharField(max_length=16, choices=RecurrenceFrequency.choices)
    interval = models.PositiveSmallIntegerField(default=1)
    weekdays = models.JSONField(default=list, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    # Day of month the rule started on, so monthly/yearly rules return to it after a short month
    anchor_day = models.PositiveSmallIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    occurrences = models.PositiveIntegerField(default=1)
    last_spawned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["issue"],
                condition=Q(deleted_at__isnull=True),
                name="issue_recurrence_unique_issue_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Recurrence"
        verbose_name_plural = "Issue Recurrences"
        db_table = "issue_recurrences"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} - every {self.interval} {self.frequency}"


@receiver(post_save, sender=Issue)
def spawn_next_occurrence_on_completion(sender, instance, created, **kwargs):
    """Queue the next occurrence as soon as a recurring work item is completed.

    Bulk updates skip signals; the periodic sweep in ``recurring_issue_task`` catches those.
    """
    if created or "state_id" not in getattr(instance, "_changes_on_save", []) or instance.completed_at is None:
        return
    if not IssueRecurrence.objects.filter(issue_id=instance.id, is_active=True).exists():
        return
    from plane.bgtasks.recurring_issue_task import spawn_next_occurrence

    issue_id = str(instance.id)
    transaction.on_commit(lambda: spawn_next_occurrence.delay(issue_id))
