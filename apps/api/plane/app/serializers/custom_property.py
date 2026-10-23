# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.exceptions import ValidationError as DjangoValidationError

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import CustomProperty, CustomPropertyType
from plane.utils.custom_property import normalize_options

OPTION_TYPES = (CustomPropertyType.SELECT, CustomPropertyType.MULTI_SELECT)


class CustomPropertySerializer(BaseSerializer):
    class Meta:
        model = CustomProperty
        fields = [
            "id",
            "name",
            "description",
            "property_type",
            "options",
            "sort_order",
            "is_active",
            "project",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        project_id = self.context.get("project_id") or getattr(self.instance, "project_id", None)
        clash = CustomProperty.objects.filter(project_id=project_id, name__iexact=name)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A field with this name already exists.")
        return name

    def validate(self, attrs):
        # The type decides how stored values are read, so it is fixed after creation.
        if self.instance and "property_type" in attrs and attrs["property_type"] != self.instance.property_type:
            raise serializers.ValidationError({"property_type": "The field type cannot be changed."})

        property_type = attrs.get("property_type") or getattr(self.instance, "property_type", None)
        if property_type in OPTION_TYPES:
            if "options" in attrs or not self.instance:
                try:
                    attrs["options"] = normalize_options(attrs.get("options", []))
                except DjangoValidationError as error:
                    raise serializers.ValidationError({"options": error.messages})
        else:
            attrs["options"] = []
        return attrs
