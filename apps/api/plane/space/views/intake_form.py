# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

# Module imports
from plane.db.models import IntakeForm
from plane.utils.intake_form import public_form_definition, submit_form, validate_submission

from .base import BaseAPIView


class FormSubmitThrottle(AnonRateThrottle):
    """Per-IP cap on submissions, on top of the default anonymous rate."""

    scope = "form_submit"
    rate = "10/hour"


class PublicIntakeFormEndpoint(BaseAPIView):
    """Anyone with the link can read an active form and submit it; no login needed."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get_throttles(self):
        if self.request.method == "POST":
            return [AnonRateThrottle(), FormSubmitThrottle()]
        return [AnonRateThrottle()]

    def get_form(self, form_anchor):
        return (
            IntakeForm.objects.filter(anchor=form_anchor, is_active=True, project__archived_at__isnull=True)
            .select_related("project")
            .first()
        )

    def get(self, request, form_anchor):
        form = self.get_form(form_anchor)
        if form is None:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(public_form_definition(form), status=status.HTTP_200_OK)

    def post(self, request, form_anchor):
        form = self.get_form(form_anchor)
        if form is None:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        # Honeypot: people never see this field, bots fill it in. Pretend it worked.
        if request.data.get("website"):
            return Response({"success_message": form.success_message}, status=status.HTTP_201_CREATED)
        cleaned, errors = validate_submission(form, request.data.get("values"))
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        submit_form(form, cleaned)
        return Response({"success_message": form.success_message}, status=status.HTTP_201_CREATED)
