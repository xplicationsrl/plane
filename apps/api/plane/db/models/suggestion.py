# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .base import BaseModel


class Suggestion(BaseModel):
    """A feature request someone left from the home screen; ``created_by`` is its author."""

    MAX_BODY_LENGTH = 2000

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="suggestions")
    body = models.TextField()

    class Meta:
        verbose_name = "Suggestion"
        verbose_name_plural = "Suggestions"
        db_table = "suggestions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace_id} {self.body[:50]}"
