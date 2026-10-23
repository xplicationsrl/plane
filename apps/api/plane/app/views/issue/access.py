# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.app.permissions import ROLE
from plane.db.models import Issue, ProjectMember


def get_accessible_issue(request, slug, project_id, issue_id):
    """The work item at the URL when the caller may see it, else None.

    The issue must belong to the URL workspace + project (``allow_permission`` only
    checks project membership). Guests only see work items they created unless the
    project lets guests view everything.
    """
    issue = (
        Issue.objects.filter(pk=issue_id, workspace__slug=slug, project_id=project_id).select_related("project").first()
    )
    if issue is None:
        return None
    is_guest = ProjectMember.objects.filter(
        workspace__slug=slug,
        project_id=project_id,
        member=request.user,
        role=ROLE.GUEST.value,
        is_active=True,
    ).exists()
    if is_guest and not issue.project.guest_view_all_features and issue.created_by_id != request.user.id:
        return None
    return issue
