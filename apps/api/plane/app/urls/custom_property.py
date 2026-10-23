# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    CustomPropertyEndpoint,
    CustomPropertyDetailEndpoint,
    IssueCustomPropertyValueEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/custom-properties/",
        CustomPropertyEndpoint.as_view(),
        name="project-custom-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/custom-properties/<uuid:pk>/",
        CustomPropertyDetailEndpoint.as_view(),
        name="project-custom-property",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/custom-property-values/",
        IssueCustomPropertyValueEndpoint.as_view(),
        name="issue-custom-property-values",
    ),
]
