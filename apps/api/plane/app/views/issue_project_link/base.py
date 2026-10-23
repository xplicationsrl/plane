# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.app.views.issue.access import get_accessible_issue
from plane.db.models import IssueActivity, IssueAssignee, IssueProjectLink, Project, ProjectMember
from plane.utils.custom_property import valid_uuids

EDITOR_ROLES = (ROLE.ADMIN.value, ROLE.MEMBER.value)


def _editable_project_ids(user, workspace_id):
    """Projects (in a workspace) where ``user`` may add or remove shared work items."""
    return {
        str(project_id)
        for project_id in ProjectMember.objects.filter(
            workspace_id=workspace_id, member=user, role__in=EDITOR_ROLES, is_active=True
        ).values_list("project_id", flat=True)
    }


class IssueLinkedProjectsEndpoint(BaseAPIView):
    """Which other projects a work item is shared with."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        ids = IssueProjectLink.objects.filter(issue=issue).values_list("project_id", flat=True)
        return Response({"project_ids": [str(i) for i in ids]}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        """Replace the set of projects the work item is shared with.

        Adding or removing a project needs member rights there too, so a link can't
        push work into (or pull it out of) a project the caller doesn't work in.
        """
        issue = get_accessible_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        requested = set(valid_uuids(request.data.get("project_ids") or []))
        requested.discard(str(issue.project_id))
        current = {str(i) for i in IssueProjectLink.objects.filter(issue=issue).values_list("project_id", flat=True)}
        allowed = _editable_project_ids(request.user, issue.workspace_id)
        to_add, to_remove = requested - current, current - requested
        if not (to_add | to_remove) <= allowed:
            return Response(
                {"error": "You can only share with projects you are a member of."},
                status=status.HTTP_403_FORBIDDEN,
            )
        projects = {
            str(p.id): p
            for p in Project.objects.filter(
                workspace_id=issue.workspace_id, id__in=to_add | to_remove, archived_at__isnull=True
            )
        }
        if not to_add <= set(projects):
            return Response({"error": "Project not found"}, status=status.HTTP_400_BAD_REQUEST)

        epoch = timezone.now().timestamp()
        with transaction.atomic():
            IssueProjectLink.objects.filter(issue=issue, project_id__in=to_remove).delete(soft=False)
            IssueProjectLink.objects.bulk_create(
                [
                    IssueProjectLink(
                        issue=issue,
                        project_id=pid,
                        workspace_id=issue.workspace_id,
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for pid in to_add
                ]
            )
            for verb, pids in (("created", to_add), ("deleted", to_remove)):
                for pid in pids:
                    name = projects[pid].name if pid in projects else ""
                    IssueActivity.objects.create(
                        issue=issue,
                        project_id=issue.project_id,
                        workspace_id=issue.workspace_id,
                        actor=request.user,
                        verb=verb,
                        field="shared_project",
                        new_value=name if verb == "created" else "",
                        old_value=name if verb == "deleted" else "",
                        new_identifier=pid if verb == "created" else None,
                        old_identifier=pid if verb == "deleted" else None,
                        epoch=epoch,
                    )
        return Response({"project_ids": sorted(requested)}, status=status.HTTP_200_OK)


class ProjectSharedIssuesEndpoint(BaseAPIView):
    """Work items from other projects shared with this one, with enough detail to list them."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        links = (
            IssueProjectLink.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue__deleted_at__isnull=True,
                issue__archived_at__isnull=True,
                issue__project__archived_at__isnull=True,
            )
            .select_related("issue", "issue__state", "issue__project")
            .order_by("-created_at")
        )
        member_of = {
            str(pid)
            for pid in ProjectMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True
            ).values_list("project_id", flat=True)
        }
        issue_ids = [link.issue_id for link in links]
        assignees = {}
        for row in IssueAssignee.objects.filter(issue_id__in=issue_ids).values("issue_id", "assignee_id"):
            assignees.setdefault(row["issue_id"], []).append(str(row["assignee_id"]))

        results = []
        for link in links:
            issue = link.issue
            results.append(
                {
                    "id": str(issue.id),
                    "name": issue.name,
                    "sequence_id": issue.sequence_id,
                    "priority": issue.priority,
                    "target_date": issue.target_date.isoformat() if issue.target_date else None,
                    "project_id": str(issue.project_id),
                    "project_identifier": issue.project.identifier,
                    "project_name": issue.project.name,
                    "state": {
                        "name": issue.state.name,
                        "color": issue.state.color,
                        "group": issue.state.group,
                    }
                    if issue.state
                    else None,
                    "assignee_ids": assignees.get(issue.id, []),
                    # Opening it needs access to its home project
                    "can_open": str(issue.project_id) in member_of,
                }
            )
        return Response(results, status=status.HTTP_200_OK)
