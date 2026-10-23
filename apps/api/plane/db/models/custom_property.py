# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class CustomPropertyType(models.TextChoices):
    TEXT = "text", "Text"
    NUMBER = "number", "Number"
    DATE = "date", "Date"
    SELECT = "select", "Select"
    MULTI_SELECT = "multi_select", "Multi select"
    CHECKBOX = "checkbox", "Checkbox"
    URL = "url", "URL"
    MEMBER = "member", "Member"


class CustomProperty(ProjectBaseModel):
    """A project-defined field shown on every work item of the project.

    ``options`` holds the choices of select/multi-select fields as
    ``[{"id": "<uuid>", "name": "...", "color": "#rrggbb"}]``; values store option ids,
    so renaming an option never rewrites values.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    property_type = models.CharField(max_length=32, choices=CustomPropertyType.choices)
    options = models.JSONField(default=list, blank=True)
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["project", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(deleted_at__isnull=True),
                name="custom_property_unique_project_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Custom Property"
        verbose_name_plural = "Custom Properties"
        db_table = "custom_properties"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.project_id} - {self.name}"


class IssueCustomPropertyValue(ProjectBaseModel):
    """The value of one custom property on one work item (JSON, shape depends on the type)."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="custom_property_values")
    property = models.ForeignKey(CustomProperty, on_delete=models.CASCADE, related_name="values")
    value = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ["issue", "property", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "property"],
                condition=Q(deleted_at__isnull=True),
                name="issue_custom_property_value_unique_issue_property_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Custom Property Value"
        verbose_name_plural = "Issue Custom Property Values"
        db_table = "issue_custom_property_values"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} - {self.property_id}"
