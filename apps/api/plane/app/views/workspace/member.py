# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Count, Q, OuterRef, Subquery, IntegerField
from django.utils import timezone
from django.db.models.functions import Coalesce

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceEntityPermission, allow_permission, ROLE

# Module imports
from plane.app.serializers import (
    ProjectMemberRoleSerializer,
    WorkspaceMemberAdminSerializer,
    WorkspaceMemberMeSerializer,
    WorkSpaceMemberSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, ProjectMember, ProjectUserProperty, WorkspaceMember, DraftIssue
from plane.utils.cache import invalidate_cache
from plane.utils.time_entry import stop_timers_on_removal

from .. import BaseViewSet


def is_sole_admin_of_any_project(slug, user_id):
    """Whether the user is the only member, and an admin, of a project in the workspace."""
    return (
        Project.objects.annotate(
            total_members=Count("project_projectmember"),
            member_with_role=Count(
                "project_projectmember",
                filter=Q(project_projectmember__member_id=user_id, project_projectmember__role=20),
            ),
        )
        .filter(total_members=1, member_with_role=1, workspace__slug=slug)
        .exists()
    )


class WorkSpaceMemberViewSet(BaseViewSet):
    serializer_class = WorkspaceMemberAdminSerializer
    model = WorkspaceMember

    search_fields = ["member__display_name", "member__first_name"]
    use_read_replica = True

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("member", "member__avatar_asset")
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)

        # Get all active workspace members
        workspace_members = self.get_queryset()
        if workspace_member.role > 5:
            serializer = WorkspaceMemberAdminSerializer(workspace_members, fields=("id", "member", "role"), many=True)
        else:
            serializer = WorkSpaceMemberSerializer(workspace_members, fields=("id", "member", "role"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)

        try:
            # Get the specific workspace member by pk
            member = self.get_queryset().get(pk=pk)
        except WorkspaceMember.DoesNotExist:
            return Response(
                {"error": "Workspace member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if workspace_member.role > ROLE.GUEST.value:
            serializer = WorkspaceMemberAdminSerializer(member, fields=("id", "member", "role"))
        else:
            serializer = WorkSpaceMemberSerializer(member, fields=("id", "member", "role"))
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        workspace_member = WorkspaceMember.objects.select_related("member", "member__avatar_asset").get(
            pk=pk, workspace__slug=slug, member__is_bot=False, is_active=True
        )
        if request.user.id == workspace_member.member_id:
            return Response(
                {"error": "You cannot update your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # SECURITY: only ``role`` is writable here. Passing other keys through let an
        # admin move a member row into another workspace via ``workspace``.
        if not isinstance(request.data, dict) or set(request.data) != {"role"}:
            return Response(
                {"error": "Only the role of a workspace member can be updated"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkSpaceMemberSerializer(workspace_member, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        role = serializer.validated_data["role"]

        # A guest can't hold any other project role, so demoting downgrades every project membership.
        is_guest = role == ROLE.GUEST.value
        if is_guest and is_sole_admin_of_any_project(slug, workspace_member.member_id):
            return Response(
                {
                    "error": "User is a part of some projects where they are the only admin, they should either leave that project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            if is_guest:
                ProjectMember.objects.filter(
                    workspace_id=workspace_member.workspace_id, member_id=workspace_member.member_id
                ).update(role=ROLE.GUEST.value, updated_at=timezone.now())
            workspace_member.role = role
            # Write only these columns so a concurrent removal or view_props save isn't reverted.
            workspace_member.save(update_fields=["role", "updated_at", "updated_by"])

        return Response(WorkSpaceMemberSerializer(workspace_member).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        # Check the user role who is deleting the user
        workspace_member = WorkspaceMember.objects.get(
            workspace__slug=slug, pk=pk, member__is_bot=False, is_active=True
        )

        # check requesting user role
        requesting_workspace_member = WorkspaceMember.objects.get(
            workspace__slug=slug, member=request.user, is_active=True
        )

        if str(workspace_member.id) == str(requesting_workspace_member.id):
            return Response(
                {"error": "You cannot remove yourself from the workspace. Please use leave workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requesting_workspace_member.role < workspace_member.role:
            return Response(
                {"error": "You cannot remove a user having role higher than you"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_sole_admin_of_any_project(slug, workspace_member.member_id):
            return Response(
                {
                    "error": "User is a part of some projects where they are the only admin, they should either leave that project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deactivate the users from the projects where the user is part of
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, updated_at=timezone.now())

        workspace_member.is_active = False
        workspace_member.save()
        stop_timers_on_removal(workspace_member.member_id, workspace__slug=slug)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        url_params=True,
        user=False,
        multiple=True,
    )
    @invalidate_cache(path="/api/users/me/settings/")
    @invalidate_cache(path="api/users/me/workspaces/", user=False, multiple=True)
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def leave(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)

        # Check if the leaving user is the only admin of the workspace
        if (
            workspace_member.role == 20
            and not WorkspaceMember.objects.filter(workspace__slug=slug, role=20, is_active=True).count() > 1
        ):
            return Response(
                {
                    "error": "You cannot leave the workspace as you are the only admin of the workspace you will have to either delete the workspace or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_sole_admin_of_any_project(slug, request.user.id):
            return Response(
                {
                    "error": "You are a part of some projects where you are the only admin, you should either leave the project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # # Deactivate the users from the projects where the user is part of
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, updated_at=timezone.now())

        # # Deactivate the user
        workspace_member.is_active = False
        workspace_member.save()
        stop_timers_on_removal(workspace_member.member_id, workspace__slug=slug)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserViewsEndpoint(BaseAPIView):
    def post(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)
        workspace_member.view_props = request.data.get("view_props", {})
        workspace_member.save()

        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserEndpoint(BaseAPIView):
    use_read_replica = True

    def get(self, request, slug):
        draft_issue_count = (
            DraftIssue.objects.filter(created_by=request.user, workspace_id=OuterRef("workspace_id"))
            .values("workspace_id")
            .annotate(count=Count("id"))
            .values("count")
        )

        workspace_member = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .annotate(draft_issue_count=Coalesce(Subquery(draft_issue_count, output_field=IntegerField()), 0))
            .first()
        )
        serializer = WorkspaceMemberMeSerializer(workspace_member)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceProjectMemberEndpoint(BaseAPIView):
    serializer_class = ProjectMemberRoleSerializer
    model = ProjectMember

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        # Fetch all project IDs where the user is involved
        project_ids = (
            ProjectMember.objects.filter(member=request.user, is_active=True)
            .values_list("project_id", flat=True)
            .distinct()
        )

        # Get all the project members in which the user is involved
        project_members = ProjectMember.objects.filter(
            workspace__slug=slug, project_id__in=project_ids, is_active=True
        ).select_related("project", "member", "workspace")
        project_members = ProjectMemberRoleSerializer(project_members, many=True).data

        project_members_dict = dict()

        # Construct a dictionary with project_id as key and project_members as value
        for project_member in project_members:
            project_id = project_member.pop("project")
            if str(project_id) not in project_members_dict:
                project_members_dict[str(project_id)] = []
            project_members_dict[str(project_id)].append(project_member)

        return Response(project_members_dict, status=status.HTTP_200_OK)


class WorkspaceMemberBulkProjectsEndpoint(BaseAPIView):
    """Add one workspace member to many projects in one go.

    Built for a workspace with a hundred like-named projects, where adding someone project by
    project is not workable. The role rules are the ones project member creation uses: a
    workspace admin is a project admin, a workspace guest stays a guest. No per-project mails
    are sent; one call could mean a hundred of them.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, member_id):
        target = WorkspaceMember.objects.get(workspace__slug=slug, member_id=member_id, is_active=True)

        project_ids = request.data.get("project_ids")
        if not isinstance(project_ids, list) or not project_ids:
            return Response({"error": "project_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        role = request.data.get("role")
        if role is None:
            role = target.role if target.role in (ROLE.ADMIN.value, ROLE.GUEST.value) else ROLE.MEMBER.value
        if role not in (ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value):
            return Response({"error": "Invalid role"}, status=status.HTTP_400_BAD_REQUEST)
        if target.role == ROLE.ADMIN.value and role != ROLE.ADMIN.value:
            return Response(
                {"error": "You cannot add a user with role lower than the workspace role"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.role == ROLE.GUEST.value and role != ROLE.GUEST.value:
            return Response(
                {"error": "You cannot add a user with role higher than the workspace role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only live projects of this workspace; unknown, foreign and archived ids are skipped, not refused.
        projects = list(
            Project.objects.filter(workspace__slug=slug, id__in=project_ids, archived_at__isnull=True).values_list(
                "id", flat=True
            )
        )
        existing = {
            membership.project_id: membership
            for membership in ProjectMember.objects.filter(member_id=member_id, project_id__in=projects)
        }

        already_member, updated, to_update = [], [], []
        for membership in existing.values():
            if membership.is_active and membership.role == role:
                already_member.append(membership.project_id)
                continue
            membership.is_active = True
            membership.role = role
            to_update.append(membership)
            updated.append(membership.project_id)
        ProjectMember.objects.bulk_update(to_update, ["is_active", "role"], batch_size=100)

        # New memberships sort above the member's existing projects, as a single add does.
        min_sort_order = (
            ProjectUserProperty.objects.filter(workspace__slug=slug, user_id=member_id)
            .order_by("sort_order")
            .values_list("sort_order", flat=True)
            .first()
        )
        sort_order = (min_sort_order - 10000) if min_sort_order is not None else 65535
        added = [project_id for project_id in projects if project_id not in existing]
        ProjectMember.objects.bulk_create(
            [
                ProjectMember(member_id=member_id, role=role, project_id=project_id, workspace_id=target.workspace_id)
                for project_id in added
            ],
            batch_size=100,
            ignore_conflicts=True,
        )
        ProjectUserProperty.objects.bulk_create(
            [
                ProjectUserProperty(
                    user_id=member_id, project_id=project_id, workspace_id=target.workspace_id, sort_order=sort_order
                )
                for project_id in added
            ],
            batch_size=100,
            ignore_conflicts=True,
        )

        return Response(
            {
                "added": len(added),
                "updated": len(updated),
                "already_member": len(already_member),
                "skipped": len(project_ids) - len(projects),
                "project_ids": [str(project_id) for project_id in added + updated],
            },
            status=status.HTTP_200_OK,
        )
