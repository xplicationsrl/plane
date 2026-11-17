# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations


def forward(apps, schema_editor):
    """Public form submissions were stored as "FORM"; the web app expects "FORMS"."""
    IntakeIssue = apps.get_model("db", "IntakeIssue")
    IntakeIssue.objects.filter(source="FORM").update(source="FORMS")


def backward(apps, schema_editor):
    IntakeIssue = apps.get_model("db", "IntakeIssue")
    IntakeIssue.objects.filter(source="FORMS").update(source="FORM")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0135_project_status_and_folders"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
