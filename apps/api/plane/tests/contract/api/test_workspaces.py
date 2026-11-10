# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for listing the key owner's workspaces.

GET /api/v1/workspaces/
"""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Workspace, WorkspaceMember

URL = "/api/v1/workspaces/"


def _workspace(owner, name):
    return Workspace.objects.create(name=name, owner=owner, slug=f"{name.lower()}-{uuid4().hex[:6]}")


@pytest.mark.contract
class TestListWorkspaces:
    def test_lists_the_workspaces_the_key_owner_is_in(self, api_key_client, workspace, create_user):
        other = _workspace(create_user, "Zeta")
        WorkspaceMember.objects.create(workspace=other, member=create_user, role=15)
        not_mine = _workspace(create_user, "Alpha")
        left = _workspace(create_user, "Left")
        WorkspaceMember.objects.create(workspace=left, member=create_user, role=15, is_active=False)

        response = api_key_client.get(URL)

        assert response.status_code == status.HTTP_200_OK
        rows = {row["slug"]: row for row in response.data}
        assert set(rows) == {workspace.slug, other.slug}
        assert not_mine.slug not in rows
        assert [row["name"] for row in response.data] == sorted(row["name"] for row in response.data)
        assert set(rows[workspace.slug]) == {"id", "name", "slug"}

    def test_needs_a_key(self, db):
        response = APIClient().get(URL)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
