# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Open-door project access.

In this deployment a workspace member who can see a project may work in it: opening a public
project makes them a member on the spot, with the same role the "Join" button used to give
(their workspace role). Private projects keep their rule: only workspace admins get in this way.
"""

# Django imports
from django.db import IntegrityError, transaction


def ensure_project_membership(user, project):
    """Return the user's active membership of ``project``, creating it when the user may just walk in.

    Returns ``None`` when the user is not an active member of the workspace, or the project is
    private and they are not a workspace admin.
    """
    from plane.db.models import ProjectMember, ProjectNetwork, ProjectUserProperty, WorkspaceMember
    from plane.db.models.project import ROLE

    membership = ProjectMember.objects.filter(project=project, member=user).first()
    if membership is not None and membership.is_active:
        return membership

    workspace_member = (
        WorkspaceMember.objects.filter(workspace_id=project.workspace_id, member=user, is_active=True)
        .only("role")
        .first()
    )
    if workspace_member is None:
        return None
    if project.network == ProjectNetwork.SECRET.value and workspace_member.role != ROLE.ADMIN.value:
        return None

    role = workspace_member.role
    if membership is not None:
        # Removed earlier: back in with the role a fresh joiner gets, not the old one.
        membership.is_active = True
        membership.role = role
        membership.save(update_fields=["is_active", "role", "updated_at"])
    else:
        try:
            with transaction.atomic():
                membership = ProjectMember.objects.create(
                    project=project, member=user, role=role, workspace_id=project.workspace_id
                )
        except IntegrityError:
            # Two requests of the same page load raced; the other one made the row.
            membership = ProjectMember.objects.get(project=project, member=user)
    ProjectUserProperty.objects.get_or_create(
        project=project, user=user, defaults={"workspace_id": project.workspace_id}
    )
    return membership
