# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.db.models import Min

# Module imports
from plane.app.permissions.base import ROLE
from plane.db.models import ProjectMember, ProjectUserProperty, WorkspaceMember


def can_manage_project_members(user, project):
    """Whether ``user`` may add members to ``project``.

    Mirrors ``allow_permission([ROLE.ADMIN])`` on project routes: an active project admin, or a
    workspace admin who is an active member of the project.
    """
    project_role = (
        ProjectMember.objects.filter(member=user, project_id=project.id, is_active=True)
        .values_list("role", flat=True)
        .first()
    )
    if project_role is None:
        return False
    if project_role == ROLE.ADMIN.value:
        return True
    return WorkspaceMember.objects.filter(
        member=user,
        workspace_id=project.workspace_id,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()


def _parse_uuids(values):
    parsed = set()
    for value in values or []:
        try:
            parsed.add(uuid.UUID(str(value)))
        except (TypeError, ValueError, AttributeError):
            continue
    return parsed


def add_assignees_to_project(*, project, assignee_ids, actor):
    """Make the given workspace members active members of ``project`` so they can be assigned.

    Only runs when ``actor`` can manage the project's members. Only active, non-bot workspace members
    with at least the MEMBER role are added, with their workspace role (guests cannot be assignees).
    Users already active in the project are left untouched, so a project guest is never promoted.

    Returns the ``ProjectMember`` rows that were created or re-activated.
    """
    requested_ids = _parse_uuids(assignee_ids)
    if not requested_ids or not isinstance(assignee_ids, (list, tuple)):
        return []

    if not can_manage_project_members(actor, project):
        return []

    already_active = set(
        ProjectMember.objects.filter(project_id=project.id, member_id__in=requested_ids, is_active=True).values_list(
            "member_id", flat=True
        )
    )
    candidate_ids = requested_ids - already_active
    if not candidate_ids:
        return []

    workspace_roles = dict(
        WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id,
            member_id__in=candidate_ids,
            is_active=True,
            role__gte=ROLE.MEMBER.value,
            member__is_bot=False,
        ).values_list("member_id", "role")
    )
    if not workspace_roles:
        return []

    # Re-activate members who left or were removed from the project.
    reactivated = list(
        ProjectMember.objects.filter(project_id=project.id, member_id__in=workspace_roles.keys(), is_active=False)
    )
    for project_member in reactivated:
        project_member.is_active = True
        project_member.role = workspace_roles[project_member.member_id]
    ProjectMember.objects.bulk_update(reactivated, ["is_active", "role"], batch_size=100)

    new_ids = set(workspace_roles.keys()) - {pm.member_id for pm in reactivated}
    if new_ids:
        sort_order_map = {
            row["user_id"]: row["min_sort_order"]
            for row in ProjectUserProperty.objects.filter(workspace_id=project.workspace_id, user_id__in=new_ids)
            .values("user_id")
            .annotate(min_sort_order=Min("sort_order"))
        }
        ProjectMember.objects.bulk_create(
            [
                ProjectMember(
                    member_id=member_id,
                    role=workspace_roles[member_id],
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                )
                for member_id in new_ids
            ],
            batch_size=10,
            ignore_conflicts=True,
        )
        ProjectUserProperty.objects.bulk_create(
            [
                ProjectUserProperty(
                    user_id=member_id,
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    sort_order=(
                        sort_order_map[member_id] - 10000 if sort_order_map.get(member_id) is not None else 65535
                    ),
                )
                for member_id in new_ids
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

    return list(
        ProjectMember.objects.filter(project_id=project.id, member_id__in=workspace_roles.keys(), is_active=True)
    )
