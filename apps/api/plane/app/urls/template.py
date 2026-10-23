# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ProjectTemplateApplyEndpoint,
    ProjectTemplateDetailEndpoint,
    ProjectTemplateEndpoint,
    WorkItemTemplateApplyEndpoint,
    WorkItemTemplateDetailEndpoint,
    WorkItemTemplateEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-templates/",
        WorkItemTemplateEndpoint.as_view(),
        name="work-item-templates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-templates/<uuid:pk>/",
        WorkItemTemplateDetailEndpoint.as_view(),
        name="work-item-template",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-templates/<uuid:pk>/apply/",
        WorkItemTemplateApplyEndpoint.as_view(),
        name="work-item-template-apply",
    ),
    path(
        "workspaces/<str:slug>/project-templates/",
        ProjectTemplateEndpoint.as_view(),
        name="project-templates",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/",
        ProjectTemplateDetailEndpoint.as_view(),
        name="project-template",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/apply/",
        ProjectTemplateApplyEndpoint.as_view(),
        name="project-template-apply",
    ),
]
