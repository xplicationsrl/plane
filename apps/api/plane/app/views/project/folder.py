# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project folders and the project status.

Open to every workspace member on purpose: this is a small-office deployment where anyone
may organise the projects page.
"""

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, ProjectFolder, Workspace
from plane.utils.project_status import PROJECT_STATUSES, set_project_status

ALL_ROLES = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]


class ProjectFolderSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=255)

    class Meta:
        model = ProjectFolder
        fields = ["id", "name", "sort_order", "workspace", "created_at", "updated_at"]
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]

    def validate_name(self, name):
        # CharField already trims; folder names are matched case-insensitively within the workspace.
        taken = ProjectFolder.objects.filter(workspace_id=self.context["workspace_id"], name__iexact=name)
        if self.instance:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError("A folder with this name already exists.")
        return name


def _status_payload(project_id):
    return Project.objects.values("status", "reopened_at").get(pk=project_id)


class ProjectFolderEndpoint(BaseAPIView):
    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        folders = ProjectFolder.objects.filter(workspace__slug=slug)
        return Response(ProjectFolderSerializer(folders, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = ProjectFolderSerializer(data=request.data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        # New folders go last.
        last = ProjectFolder.objects.filter(workspace=workspace).order_by("-sort_order").first()
        folder = ProjectFolder(
            workspace=workspace,
            name=serializer.validated_data["name"],
            sort_order=(last.sort_order + 10000) if last else 65535,
        )
        folder.save(created_by_id=request.user.id)
        return Response(ProjectFolderSerializer(folder).data, status=status.HTTP_201_CREATED)


class ProjectFolderDetailEndpoint(BaseAPIView):
    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def patch(self, request, slug, pk):
        folder = ProjectFolder.objects.get(pk=pk, workspace__slug=slug)
        serializer = ProjectFolderSerializer(
            folder, data=request.data, partial=True, context={"workspace_id": folder.workspace_id}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def delete(self, request, slug, pk):
        folder = ProjectFolder.objects.get(pk=pk, workspace__slug=slug)
        # Folders are soft-deleted, so SET_NULL never fires: move the projects out by hand.
        # all_objects: archived and trashed projects must not keep pointing at a deleted folder.
        Project.all_objects.filter(folder=folder).update(folder=None)
        folder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectFolderAssignEndpoint(BaseAPIView):
    """Put a project in a folder, or take it out with ``{"folder": null}``."""

    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        folder_id = request.data.get("folder")
        if folder_id is not None:
            # 404 unless the folder is in this workspace.
            folder_id = ProjectFolder.objects.get(pk=folder_id, workspace__slug=slug).id
        Project.objects.filter(pk=project.id).update(folder_id=folder_id)
        return Response({"folder": folder_id}, status=status.HTTP_200_OK)


class ProjectStatusEndpoint(BaseAPIView):
    """Set the project status by hand: ``{"status": "completed"}`` marks it done."""

    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        new_status = request.data.get("status")
        if new_status not in PROJECT_STATUSES:
            return Response(
                {"error": f"Status must be one of: {', '.join(PROJECT_STATUSES)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        set_project_status(project.id, new_status)
        return Response(_status_payload(project.id), status=status.HTTP_200_OK)


class ProjectReopenedNoticeEndpoint(BaseAPIView):
    """Dismiss the "reopened because a work item was added" notice."""

    @allow_permission(ALL_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        Project.objects.filter(pk=project.id).update(reopened_at=None)
        return Response(_status_payload(project.id), status=status.HTTP_200_OK)
