# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IntakeFormDetailEndpoint, IntakeFormEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-forms/",
        IntakeFormEndpoint.as_view(),
        name="intake-forms",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-forms/<uuid:pk>/",
        IntakeFormDetailEndpoint.as_view(),
        name="intake-form",
    ),
]
