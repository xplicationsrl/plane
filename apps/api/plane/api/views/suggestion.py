# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.api.views.base import BaseAPIView
from plane.db.models import Suggestion
from plane.license.api.permissions import InstanceAdminPermission


class SuggestionReadSerializer(serializers.ModelSerializer):
    workspace = serializers.CharField(source="workspace.slug", read_only=True)
    author_name = serializers.CharField(source="created_by.display_name", read_only=True, default=None)
    author_email = serializers.CharField(source="created_by.email", read_only=True, default=None)

    class Meta:
        model = Suggestion
        fields = ["id", "body", "workspace", "author_name", "author_email", "created_at"]
        read_only_fields = fields


class SuggestionListEndpoint(BaseAPIView):
    """Every suggestion on this instance, newest first. Read with an instance admin's API key."""

    permission_classes = [InstanceAdminPermission]

    def get(self, request):
        return self.paginate(
            request=request,
            queryset=Suggestion.objects.select_related("workspace", "created_by").order_by("-created_at"),
            on_results=lambda rows: SuggestionReadSerializer(rows, many=True).data,
        )
