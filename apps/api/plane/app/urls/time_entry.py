# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueTimeEntryDetailEndpoint,
    IssueTimeEntryEndpoint,
    RunningTimeEntryEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/time-entries/",
        IssueTimeEntryEndpoint.as_view(),
        name="issue-time-entries",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/time-entries/<uuid:pk>/",
        IssueTimeEntryDetailEndpoint.as_view(),
        name="issue-time-entry",
    ),
    path(
        "workspaces/<str:slug>/time-entries/running/",
        RunningTimeEntryEndpoint.as_view(),
        name="running-time-entry",
    ),
]
