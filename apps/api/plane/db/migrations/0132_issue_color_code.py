# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0131_issue_project_links"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="color_code",
            field=models.CharField(
                blank=True,
                choices=[
                    ("red", "Red"),
                    ("orange", "Orange"),
                    ("yellow", "Yellow"),
                    ("green", "Green"),
                    ("teal", "Teal"),
                    ("blue", "Blue"),
                    ("purple", "Purple"),
                    ("pink", "Pink"),
                ],
                max_length=16,
                null=True,
            ),
        ),
    ]
