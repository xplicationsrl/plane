# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.exceptions import ValidationError

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.app.views.issue.access import get_accessible_issue
from plane.db.models import Project, ProjectMember, ProjectTemplate, WorkItemTemplate, WorkspaceMember
from plane.utils.templates import (
    apply_project_template,
    apply_work_item_template_extras,
    sanitize_work_item_template,
    snapshot_project,
    snapshot_work_item,
)


class WorkItemTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkItemTemplate
        fields = ["id", "name", "description", "template", "project", "created_by", "created_at", "updated_at"]
        read_only_fields = ["project", "created_by", "created_at", "updated_at"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value.strip()


class ProjectTemplateSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()

    class Meta:
        model = ProjectTemplate
        fields = ["id", "name", "description", "summary", "created_by", "created_at", "updated_at"]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value.strip()

    def get_summary(self, template):
        data = template.data or {}
        return {
            key: len(data.get(key) or [])
            for key in ("states", "labels", "custom_properties", "work_item_templates", "work_items")
        }


def _is_project_admin_or_creator(request, slug, project_id, template):
    return (
        template.created_by_id == request.user.id
        or ProjectMember.objects.filter(
            workspace__slug=slug, project_id=project_id, member=request.user, role=ROLE.ADMIN.value, is_active=True
        ).exists()
    )


class WorkItemTemplateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        templates = WorkItemTemplate.objects.filter(workspace__slug=slug, project_id=project_id)
        return Response(WorkItemTemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        """Create a template from ``template`` data, or snapshot an existing work item with ``issue_id``."""
        serializer = WorkItemTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if request.data.get("issue_id"):
            issue = get_accessible_issue(request, slug, project_id, request.data["issue_id"])
            if issue is None:
                return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
            raw = snapshot_work_item(issue)
        else:
            raw = request.data.get("template") or {}
        try:
            template = sanitize_work_item_template(project_id, raw)
        except ValidationError as error:
            return Response({"template": error.messages}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(project_id=project_id, template=template)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkItemTemplateDetailEndpoint(BaseAPIView):
    def get_template(self, slug, project_id, pk):
        return WorkItemTemplate.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, pk):
        template = self.get_template(slug, project_id, pk)
        if template is None or not _is_project_admin_or_creator(request, slug, project_id, template):
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkItemTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        extra = {}
        if "template" in request.data:
            try:
                extra["template"] = sanitize_work_item_template(project_id, request.data["template"])
            except ValidationError as error:
                return Response({"template": error.messages}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(**extra)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, pk):
        template = self.get_template(slug, project_id, pk)
        if template is None or not _is_project_admin_or_creator(request, slug, project_id, template):
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        template.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkItemTemplateApplyEndpoint(BaseAPIView):
    """Adds a template's sub-work items and custom property values to a just-created work item."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, pk):
        template = WorkItemTemplate.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        issue = get_accessible_issue(request, slug, project_id, request.data.get("issue_id"))
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        # Re-check against the project as it is now: ids may have been deleted since saving
        data = sanitize_work_item_template(project_id, template.template)
        created = apply_work_item_template_extras(issue, data, request.user.id)
        return Response({"sub_issues": created}, status=status.HTTP_200_OK)


class ProjectTemplateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        templates = ProjectTemplate.objects.filter(workspace__slug=slug)
        return Response(ProjectTemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        """Snapshot ``project_id`` (a project the caller administers) into a new template."""
        project = Project.objects.filter(workspace__slug=slug, pk=request.data.get("project_id")).first()
        is_admin = (
            project
            and ProjectMember.objects.filter(
                project=project, member=request.user, role=ROLE.ADMIN.value, is_active=True
            ).exists()
        )
        if not is_admin:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = snapshot_project(project, include_work_items=bool(request.data.get("include_work_items")))
        serializer.save(workspace_id=project.workspace_id, data=data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProjectTemplateDetailEndpoint(BaseAPIView):
    def can_manage(self, request, slug, template):
        return (
            template.created_by_id == request.user.id
            or WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, role=ROLE.ADMIN.value, is_active=True
            ).exists()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None or not self.can_manage(request, slug, template):
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None or not self.can_manage(request, slug, template):
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        template.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateApplyEndpoint(BaseAPIView):
    """Shapes a project the caller administers (typically just created) after a template."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        project = Project.objects.filter(workspace__slug=slug, pk=request.data.get("project_id")).first()
        if template is None or project is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if not ProjectMember.objects.filter(
            project=project, member=request.user, role=ROLE.ADMIN.value, is_active=True
        ).exists():
            return Response({"error": "Only project admins can apply templates"}, status=status.HTTP_403_FORBIDDEN)
        try:
            apply_project_template(project, template.data, request.user.id)
        except ValidationError as error:
            return Response({"error": error.messages}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)
