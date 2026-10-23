# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import CustomPropertySerializer
from plane.app.views.base import BaseAPIView
from plane.app.views.issue.access import get_accessible_issue
from plane.db.models import (
    CustomProperty,
    CustomPropertyType,
    IssueActivity,
    IssueCustomPropertyValue,
)
from plane.utils.custom_property import display_value, normalize_value, valid_uuids


def prune_removed_options(prop, previous_option_ids):
    """Drop references to options that were removed from a select field."""
    removed = previous_option_ids - {option["id"] for option in prop.options}
    if not removed:
        return
    values = IssueCustomPropertyValue.objects.filter(property=prop)
    if prop.property_type == CustomPropertyType.SELECT:
        values.filter(value__in=list(removed)).delete(soft=False)
        return
    for row in values:
        kept = [option_id for option_id in row.value or [] if option_id not in removed]
        if not kept:
            row.delete(soft=False)
        elif kept != row.value:
            row.value = kept
            row.save(update_fields=["value", "updated_at"])


class CustomPropertyEndpoint(BaseAPIView):
    """Project-level custom fields: everyone in the project reads them, admins manage them."""

    def get_queryset(self, slug, project_id):
        return CustomProperty.objects.filter(workspace__slug=slug, project_id=project_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        properties = self.get_queryset(slug, project_id)
        return Response(CustomPropertySerializer(properties, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        serializer = CustomPropertySerializer(data=request.data, context={"project_id": project_id})
        serializer.is_valid(raise_exception=True)
        last = self.get_queryset(slug, project_id).order_by("-sort_order").first()
        serializer.save(
            project_id=project_id,
            sort_order=request.data.get("sort_order", (last.sort_order + 10000) if last else 65535),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CustomPropertyDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id, pk):
        prop = CustomProperty.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if prop is None:
            return Response({"error": "Field not found"}, status=status.HTTP_404_NOT_FOUND)
        previous_option_ids = {option["id"] for option in prop.options or []}
        serializer = CustomPropertySerializer(prop, data=request.data, partial=True, context={"project_id": project_id})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            prop = serializer.save()
            prune_removed_options(prop, previous_option_ids)
        return Response(CustomPropertySerializer(prop).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, pk):
        prop = CustomProperty.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if prop is None:
            return Response({"error": "Field not found"}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            IssueCustomPropertyValue.objects.filter(property=prop).delete(soft=False)
            prop.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


def serialize_values(issue):
    """``{property_id: value}`` for the issue's values on active fields."""
    rows = IssueCustomPropertyValue.objects.filter(issue=issue, property__is_active=True).values("property_id", "value")
    return {str(row["property_id"]): row["value"] for row in rows}


def set_issue_custom_values(issue, changes, actor):
    """Validate and store ``{property_id: value}`` on ``issue``; None or empty clears a value.

    Returns ``(errors, changed)``; nothing is written when there are errors. Every change
    is recorded in the work item's activity.
    """
    properties = {
        str(prop.id): prop
        for prop in CustomProperty.objects.filter(project_id=issue.project_id, id__in=valid_uuids(changes))
    }
    errors, normalized = {}, {}
    for property_id, value in changes.items():
        prop = properties.get(str(property_id))
        if prop is None:
            errors[property_id] = ["Unknown field."]
            continue
        try:
            normalized[prop.id] = normalize_value(prop, value)
        except ValidationError as error:
            errors[property_id] = error.messages
    if errors:
        return errors, False

    existing = {row.property_id: row for row in IssueCustomPropertyValue.objects.filter(issue=issue)}
    epoch = timezone.now().timestamp()
    changed = False
    with transaction.atomic():
        for property_id, value in normalized.items():
            prop = properties[str(property_id)]
            row = existing.get(property_id)
            old_value = row.value if row else None
            if old_value == value:
                continue
            changed = True
            if value is None:
                row.delete(soft=False)
            elif row:
                row.value = value
                row.save(update_fields=["value", "updated_at"])
            else:
                IssueCustomPropertyValue.objects.create(
                    issue=issue, property=prop, project_id=issue.project_id, value=value
                )
            IssueActivity.objects.create(
                issue=issue,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                actor=actor,
                verb="updated",
                field="custom_property",
                comment=prop.name,
                old_value=display_value(prop, old_value),
                new_value=display_value(prop, value),
                new_identifier=prop.id,
                epoch=epoch,
            )
    return {}, changed


class IssueCustomPropertyValueEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_values(issue), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        if not isinstance(request.data, dict):
            return Response({"error": "Expected an object of field values"}, status=status.HTTP_400_BAD_REQUEST)
        errors, _ = set_issue_custom_values(issue, request.data, request.user)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_values(issue), status=status.HTTP_200_OK)


class ProjectCustomPropertyValuesEndpoint(BaseAPIView):
    """Values of many work items at once, for list layouts: ``?issue_ids=a,b,c``."""

    MAX_ISSUES = 500

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        issue_ids = valid_uuids(request.query_params.get("issue_ids", "").split(","))[: self.MAX_ISSUES]
        rows = IssueCustomPropertyValue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_id__in=issue_ids,
            issue__deleted_at__isnull=True,
            property__is_active=True,
        ).values("issue_id", "property_id", "value")
        result = {issue_id: {} for issue_id in issue_ids}
        for row in rows:
            result[str(row["issue_id"])][str(row["property_id"])] = row["value"]
        return Response(result, status=status.HTTP_200_OK)
