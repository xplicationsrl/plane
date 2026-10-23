# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta

# Django imports
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import UserLiteSerializer
from plane.app.views.base import BaseAPIView
from plane.app.views.issue.access import get_accessible_issue
from plane.db.models import IssueTimeEntry, ProjectMember

# A single entry can't exceed a day; longer work is logged across days.
MAX_ENTRY_SECONDS = 24 * 60 * 60


class TimeEntrySerializer(serializers.ModelSerializer):
    user_detail = UserLiteSerializer(read_only=True, source="user")
    is_running = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueTimeEntry
        fields = [
            "id",
            "issue",
            "project",
            "user",
            "user_detail",
            "started_at",
            "ended_at",
            "duration_seconds",
            "logged_on",
            "description",
            "is_running",
            "created_at",
        ]
        read_only_fields = ["issue", "project", "user", "started_at", "ended_at", "created_at"]

    def validate_duration_seconds(self, value):
        if value <= 0 or value > MAX_ENTRY_SECONDS:
            raise serializers.ValidationError("Duration must be between 1 second and 24 hours.")
        return value

    def validate_logged_on(self, value):
        if value > timezone.localdate() + timedelta(days=366):
            raise serializers.ValidationError("Date is too far in the future.")
        return value


def stop_timer(entry, now=None):
    """Finish a running timer, capping it at a day so a forgotten timer stays sane."""
    now = now or timezone.now()
    elapsed = int((now - entry.started_at).total_seconds())
    entry.ended_at = now
    entry.duration_seconds = max(1, min(elapsed, MAX_ENTRY_SECONDS))
    entry.save(update_fields=["ended_at", "duration_seconds", "updated_at"])
    return entry


def time_summary(issue):
    entries = IssueTimeEntry.objects.filter(issue=issue).select_related("user")
    # Running timers count once they stop
    finished = entries.filter(Q(started_at__isnull=True) | Q(ended_at__isnull=False))
    total = finished.aggregate(total=Sum("duration_seconds"))["total"] or 0
    return {"total_seconds": total, "entries": TimeEntrySerializer(entries, many=True).data}


def can_manage_entry(request, slug, project_id, entry):
    if entry.user_id == request.user.id:
        return True
    return ProjectMember.objects.filter(
        workspace__slug=slug, project_id=project_id, member=request.user, role=ROLE.ADMIN.value, is_active=True
    ).exists()


class IssueTimeEntryEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(time_summary(issue), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Log time manually, or start a timer with ``{"timer": "start"}``."""
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        if request.data.get("timer") == "start":
            now = timezone.now()
            stopped = None
            try:
                with transaction.atomic():
                    running = (
                        IssueTimeEntry.objects.select_for_update()
                        .filter(user=request.user, started_at__isnull=False, ended_at__isnull=True)
                        .first()
                    )
                    if running:
                        stopped = stop_timer(running, now)
                    entry = IssueTimeEntry.objects.create(
                        issue=issue,
                        project_id=project_id,
                        user=request.user,
                        started_at=now,
                        logged_on=timezone.localdate(now),
                        description=str(request.data.get("description", ""))[:1000],
                    )
            except IntegrityError:
                return Response({"error": "A timer is already running"}, status=status.HTTP_409_CONFLICT)
            return Response(
                {
                    "entry": TimeEntrySerializer(entry).data,
                    "stopped": TimeEntrySerializer(stopped).data if stopped else None,
                },
                status=status.HTTP_201_CREATED,
            )

        serializer = TimeEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if "duration_seconds" not in serializer.validated_data:
            return Response({"duration_seconds": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(issue=issue, project_id=project_id, user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class IssueTimeEntryDetailEndpoint(BaseAPIView):
    def get_entry(self, slug, project_id, issue_id, pk):
        return IssueTimeEntry.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        ).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id, pk):
        """Edit an entry, or stop a running timer with ``{"stop": true}``."""
        entry = self.get_entry(slug, project_id, issue_id, pk)
        if entry is None or not can_manage_entry(request, slug, project_id, entry):
            return Response({"error": "Time entry not found"}, status=status.HTTP_404_NOT_FOUND)

        if request.data.get("stop"):
            if not entry.is_running:
                return Response({"error": "The timer is not running"}, status=status.HTTP_400_BAD_REQUEST)
            return Response(TimeEntrySerializer(stop_timer(entry)).data, status=status.HTTP_200_OK)

        if entry.is_running and "duration_seconds" in request.data:
            return Response(
                {"duration_seconds": ["Stop the timer before editing its duration."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = {
            key: request.data[key] for key in ("duration_seconds", "logged_on", "description") if key in request.data
        }
        serializer = TimeEntrySerializer(entry, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        entry = self.get_entry(slug, project_id, issue_id, pk)
        if entry is None or not can_manage_entry(request, slug, project_id, entry):
            return Response({"error": "Time entry not found"}, status=status.HTTP_404_NOT_FOUND)
        entry.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RunningTimeEntryEndpoint(BaseAPIView):
    """The caller's running timer in this workspace, if any."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        entry = (
            IssueTimeEntry.objects.filter(
                workspace__slug=slug, user=request.user, started_at__isnull=False, ended_at__isnull=True
            )
            .select_related("issue", "project")
            .first()
        )
        if entry is None:
            return Response(None, status=status.HTTP_200_OK)
        data = TimeEntrySerializer(entry).data
        data["issue_detail"] = {
            "id": str(entry.issue_id),
            "name": entry.issue.name,
            "sequence_id": entry.issue.sequence_id,
            "project_identifier": entry.project.identifier,
        }
        return Response(data, status=status.HTTP_200_OK)
