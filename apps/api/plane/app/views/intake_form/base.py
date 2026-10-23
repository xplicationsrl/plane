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
from plane.db.models import IntakeForm
from plane.utils.intake_form import clean_form_fields


class IntakeFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntakeForm
        fields = [
            "id",
            "name",
            "description",
            "anchor",
            "is_active",
            "fields",
            "success_message",
            "submission_count",
            "project",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["anchor", "submission_count", "project", "created_at", "updated_at"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value.strip()

    def validate_fields(self, value):
        try:
            return clean_form_fields(self.context["project_id"], value)
        except ValidationError as error:
            raise serializers.ValidationError(error.messages)


class IntakeFormEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        forms = IntakeForm.objects.filter(workspace__slug=slug, project_id=project_id)
        return Response(IntakeFormSerializer(forms, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        serializer = IntakeFormSerializer(data=request.data, context={"project_id": project_id})
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class IntakeFormDetailEndpoint(BaseAPIView):
    def get_form(self, slug, project_id, pk):
        return IntakeForm.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id, pk):
        form = self.get_form(slug, project_id, pk)
        if form is None:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IntakeFormSerializer(form, data=request.data, partial=True, context={"project_id": project_id})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, pk):
        form = self.get_form(slug, project_id, pk)
        if form is None:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        form.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
