# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IssueLinkedProjectsEndpoint, ProjectSharedIssuesEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/linked-projects/",
        IssueLinkedProjectsEndpoint.as_view(),
        name="issue-linked-projects",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/shared-issues/",
        ProjectSharedIssuesEndpoint.as_view(),
        name="project-shared-issues",
    ),
]
