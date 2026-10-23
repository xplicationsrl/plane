# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel


class IssueProjectLink(BaseModel):
    """Shares a work item with another project of the same workspace.

    The work item keeps its home project (states, sequence, permissions); linked
    projects list it as shared so their members can follow it.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="project_links")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="shared_issue_links")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_project_links")

    class Meta:
        unique_together = ["issue", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "project"],
                condition=Q(deleted_at__isnull=True),
                name="issue_project_link_unique_issue_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Project Link"
        verbose_name_plural = "Issue Project Links"
        db_table = "issue_project_links"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} -> {self.project_id}"
