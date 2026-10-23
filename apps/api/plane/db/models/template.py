# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel
from .workspace import WorkspaceBaseModel


class WorkItemTemplate(ProjectBaseModel):
    """A reusable starting point for new work items in a project.

    ``template`` holds the prefilled fields and sub-work items:
    ``{"name", "description_html", "priority", "state_id", "assignee_ids", "label_ids",
    "module_ids", "estimate_point_id", "custom_properties": {property_id: value},
    "sub_issues": [{"name", "description_html", "priority", "assignee_ids", "label_ids"}]}``.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    template = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Work Item Template"
        verbose_name_plural = "Work Item Templates"
        db_table = "work_item_templates"
        ordering = ("name",)

    def __str__(self):
        return f"{self.project_id} - {self.name}"


class ProjectTemplate(WorkspaceBaseModel):
    """A snapshot of a project's structure to start new projects from.

    ``data`` holds ``states``, ``labels``, ``custom_properties``, ``work_item_templates``,
    ``work_items`` and feature ``settings``, all referencing each other by name so the
    snapshot is independent of the source project's ids.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    data = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Project Template"
        verbose_name_plural = "Project Templates"
        db_table = "project_templates"
        ordering = ("name",)

    def __str__(self):
        return f"{self.workspace_id} - {self.name}"
