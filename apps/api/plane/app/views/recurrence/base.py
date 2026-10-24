# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.app.views.issue.access import get_accessible_issue
from plane.db.models import IssueRecurrence, RecurrenceFrequency
from plane.utils.recurrence import next_due_date

MAX_INTERVAL = 365


class IssueRecurrenceSerializer(serializers.ModelSerializer):
    next_due_on = serializers.SerializerMethodField()

    class Meta:
        model = IssueRecurrence
        fields = [
            "id",
            "issue",
            "frequency",
            "interval",
            "weekdays",
            "ends_on",
            "is_active",
            "occurrences",
            "next_due_on",
        ]
        read_only_fields = ["issue", "is_active", "occurrences"]

    def validate_interval(self, value):
        if not 1 <= value <= MAX_INTERVAL:
            raise serializers.ValidationError(f"Interval must be between 1 and {MAX_INTERVAL}.")
        return value

    def validate_weekdays(self, value):
        if not isinstance(value, list) or any(not isinstance(day, int) or not 0 <= day <= 6 for day in value):
            raise serializers.ValidationError("Weekdays must be numbers from 0 (Monday) to 6 (Sunday).")
        return sorted(set(value))

    def validate(self, attrs):
        frequency = attrs.get("frequency") or getattr(self.instance, "frequency", None)
        if frequency != RecurrenceFrequency.WEEKLY:
            attrs["weekdays"] = []
        return attrs

    def get_next_due_on(self, recurrence):
        """When the next occurrence will be due, as a preview for the UI."""
        following = next_due_date(recurrence, recurrence.issue, timezone.localdate())
        return following.isoformat() if following else None


class IssueRecurrenceEndpoint(BaseAPIView):
    def get_recurrence(self, issue):
        return IssueRecurrence.objects.filter(issue=issue).select_related("issue").first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        recurrence = self.get_recurrence(issue)
        return Response(IssueRecurrenceSerializer(recurrence).data if recurrence else None, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        recurrence = self.get_recurrence(issue)
        serializer = IssueRecurrenceSerializer(recurrence, data=request.data, partial=recurrence is not None)
        serializer.is_valid(raise_exception=True)
        anchor = issue.target_date or issue.start_date or timezone.localdate()
        recurrence = serializer.save(issue=issue, project_id=project_id, is_active=True, anchor_day=anchor.day)
        return Response(IssueRecurrenceSerializer(recurrence).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        IssueRecurrence.objects.filter(issue=issue).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
