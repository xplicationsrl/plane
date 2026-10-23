# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.space.views.intake_form import PublicIntakeFormEndpoint

urlpatterns = [
    path("forms/<str:form_anchor>/", PublicIntakeFormEndpoint.as_view(), name="public-intake-form"),
]
