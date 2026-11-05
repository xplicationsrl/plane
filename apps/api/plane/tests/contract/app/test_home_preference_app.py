# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the order of the widgets on the home page."""

from importlib import import_module
from uuid import uuid4

import pytest
from django.apps import apps
from django.utils import timezone
from rest_framework import status

from plane.db.models import User, Workspace, WorkspaceHomePreference

migration = import_module("plane.db.migrations.0134_move_stickies_to_top_of_home")


def _other_user():
    return User.objects.create(email=f"h-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])


def _preference(workspace, user, key, sort_order):
    return WorkspaceHomePreference.objects.create(workspace=workspace, user=user, key=key, sort_order=sort_order)


def _order(workspace, user):
    return list(
        WorkspaceHomePreference.objects.filter(workspace=workspace, user=user)
        .order_by("-sort_order")
        .values_list("key", flat=True)
    )


@pytest.mark.contract
class TestDefaultHomeWidgetOrder:
    @pytest.mark.django_db
    def test_new_user_sees_stickies_first(self, session_client, workspace):
        response = session_client.get(f"/api/workspaces/{workspace.slug}/home-preferences/")

        assert response.status_code == status.HTTP_200_OK
        widgets = sorted(response.data, key=lambda widget: widget["sort_order"], reverse=True)
        assert [widget["key"] for widget in widgets] == ["my_stickies", "quick_links", "recents"]


@pytest.mark.unit
class TestMoveStickiesToTopMigration:
    @pytest.mark.django_db
    def test_moves_stickies_above_default_order(self, create_user, workspace):
        _preference(workspace, create_user, "quick_links", 999)
        _preference(workspace, create_user, "recents", 998)
        _preference(workspace, create_user, "my_stickies", 997)

        migration.move_stickies_to_top(apps, None)

        assert _order(workspace, create_user) == ["my_stickies", "quick_links", "recents"]

    @pytest.mark.django_db
    def test_keeps_the_order_of_the_other_widgets(self, create_user, workspace):
        _preference(workspace, create_user, "recents", 30000)
        _preference(workspace, create_user, "my_stickies", 20000)
        _preference(workspace, create_user, "quick_links", 10000)

        migration.move_stickies_to_top(apps, None)

        assert _order(workspace, create_user) == ["my_stickies", "recents", "quick_links"]

    @pytest.mark.django_db
    def test_each_user_and_workspace_is_handled_separately(self, create_user, workspace):
        other_user = _other_user()
        other_workspace = Workspace.objects.create(name="Other", owner=create_user, slug=f"o-{uuid4().hex[:8]}")
        _preference(workspace, create_user, "quick_links", 50000)
        stickies = _preference(workspace, create_user, "my_stickies", 100)
        _preference(workspace, other_user, "quick_links", 900000)
        other_user_stickies = _preference(workspace, other_user, "my_stickies", 100)
        _preference(other_workspace, create_user, "quick_links", 700000)
        other_workspace_stickies = _preference(other_workspace, create_user, "my_stickies", 100)

        migration.move_stickies_to_top(apps, None)

        stickies.refresh_from_db()
        other_user_stickies.refresh_from_db()
        other_workspace_stickies.refresh_from_db()
        assert stickies.sort_order == 60000
        assert other_user_stickies.sort_order == 910000
        assert other_workspace_stickies.sort_order == 710000

    @pytest.mark.django_db
    def test_ignores_deleted_rows_and_keeps_stickies_disabled(self, create_user, workspace):
        WorkspaceHomePreference.objects.create(
            workspace=workspace,
            user=create_user,
            key="recents",
            sort_order=500000,
            deleted_at=timezone.now(),
        )
        _preference(workspace, create_user, "quick_links", 999)
        stickies = _preference(workspace, create_user, "my_stickies", 997)
        stickies.is_enabled = False
        stickies.save()

        migration.move_stickies_to_top(apps, None)

        stickies.refresh_from_db()
        assert stickies.sort_order == 10999
        assert stickies.is_enabled is False
