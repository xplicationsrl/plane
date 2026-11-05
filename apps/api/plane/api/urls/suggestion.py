# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import SuggestionListEndpoint

urlpatterns = [
    path("suggestions/", SuggestionListEndpoint.as_view(), name="suggestions"),
]
