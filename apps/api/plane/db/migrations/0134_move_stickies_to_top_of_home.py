# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations
from django.db.models import OuterRef, Subquery


def move_stickies_to_top(apps, schema_editor):
    """Place the stickies widget above every other widget on each user's existing home page."""
    WorkspaceHomePreference = apps.get_model("db", "WorkspaceHomePreference")
    highest_sort_order = (
        WorkspaceHomePreference.objects.filter(
            workspace_id=OuterRef("workspace_id"),
            user_id=OuterRef("user_id"),
            deleted_at__isnull=True,
        )
        .order_by("-sort_order")
        .values("sort_order")[:1]
    )
    WorkspaceHomePreference.objects.filter(key="my_stickies", deleted_at__isnull=True).update(
        sort_order=Subquery(highest_sort_order) + 10000
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0133_suggestion"),
    ]

    operations = [
        migrations.RunPython(move_stickies_to_top, migrations.RunPython.noop),
    ]
