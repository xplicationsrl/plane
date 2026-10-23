# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


def generate_form_anchor():
    return secrets.token_urlsafe(16)


class IntakeForm(ProjectBaseModel):
    """A public request form that turns each submission into a work item.

    Anyone with the link can submit while the form is active. Submissions land in the
    project's Intake when it is enabled, otherwise directly as work items. ``fields``
    lists what the form asks besides the title, in order:
    ``[{"key": "description" | "priority" | "submitter_name" | "submitter_email" |
    "property:<uuid>", "label": "...", "required": bool, "help_text": "..."}]``.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    anchor = models.CharField(max_length=64, unique=True, default=generate_form_anchor, db_index=True)
    is_active = models.BooleanField(default=True)
    fields = models.JSONField(default=list, blank=True)
    success_message = models.TextField(blank=True, default="")
    submission_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Intake Form"
        verbose_name_plural = "Intake Forms"
        db_table = "intake_forms"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project_id} - {self.name}"
