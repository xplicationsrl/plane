# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.api.serializers import WorkspaceLiteSerializer
from plane.api.views.base import BaseAPIView
from plane.db.models import Workspace


class WorkspaceListAPIEndpoint(BaseAPIView):
    """The workspaces the key's owner is an active member of.

    Lets an integration (the Kimai time tracker, for one) find its workspaces by itself
    instead of having the slugs configured by hand.
    """

    serializer_class = WorkspaceLiteSerializer
    model = Workspace
    use_read_replica = True

    def get(self, request):
        workspaces = (
            Workspace.objects.filter(
                workspace_member__member=request.user,
                workspace_member__is_active=True,
            )
            .distinct()
            .order_by("name")
        )
        return Response(WorkspaceLiteSerializer(workspaces, many=True).data, status=status.HTTP_200_OK)
