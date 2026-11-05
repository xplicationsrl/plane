# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Suggestion, Workspace


class SuggestionThrottle(UserRateThrottle):
    """Per-person cap, so a stuck client or a script can't flood the list."""

    scope = "suggestion"
    rate = "20/hour"


class SuggestionSerializer(serializers.ModelSerializer):
    body = serializers.CharField(max_length=Suggestion.MAX_BODY_LENGTH)

    class Meta:
        model = Suggestion
        fields = ["id", "body", "created_at"]
        read_only_fields = ["id", "created_at"]


class SuggestionEndpoint(BaseAPIView):
    """Workspace members leave suggestions here. Reading them is the instance-admin v1 endpoint."""

    throttle_classes = [SuggestionThrottle]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        serializer = SuggestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        suggestion = Suggestion(workspace=Workspace.objects.get(slug=slug), body=serializer.validated_data["body"])
        suggestion.save(created_by_id=request.user.id)
        return Response(SuggestionSerializer(suggestion).data, status=status.HTTP_201_CREATED)
