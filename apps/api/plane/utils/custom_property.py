# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Validation and display helpers for work item custom property values."""

# Python imports
import math
import re
from datetime import date
from uuid import UUID, uuid4

# Django imports
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator

# Module imports
from plane.db.models import CustomPropertyType, ProjectMember, User

MAX_TEXT_LENGTH = 10000
MAX_OPTIONS = 100
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def normalize_options(options):
    """Validate a select field's options, assigning ids to new ones."""
    if not isinstance(options, list):
        raise ValidationError("Options must be a list.")
    if len(options) > MAX_OPTIONS:
        raise ValidationError(f"A field can have at most {MAX_OPTIONS} options.")
    normalized, seen_ids, seen_names = [], set(), set()
    for option in options:
        if not isinstance(option, dict):
            raise ValidationError("Each option must be an object.")
        name = str(option.get("name", "")).strip()
        if not name or len(name) > 255:
            raise ValidationError("Each option needs a name of at most 255 characters.")
        if name.lower() in seen_names:
            raise ValidationError(f"Duplicate option: {name}")
        option_id = str(option.get("id") or uuid4())
        if option_id in seen_ids:
            raise ValidationError("Duplicate option id.")
        color = option.get("color") or "#6b7280"
        if not HEX_COLOR.match(color):
            raise ValidationError("Option colors must be #rrggbb.")
        seen_ids.add(option_id)
        seen_names.add(name.lower())
        normalized.append({"id": option_id, "name": name, "color": color})
    return normalized


def normalize_value(prop, value):
    """Return ``value`` in its stored shape for ``prop``, or None when it clears the field.

    Raises ValidationError when the value does not fit the property type.
    """
    if value is None or value == "" or value == []:
        return None

    kind = prop.property_type
    if kind == CustomPropertyType.TEXT:
        if not isinstance(value, str):
            raise ValidationError("Expected text.")
        if len(value) > MAX_TEXT_LENGTH:
            raise ValidationError(f"Text can be at most {MAX_TEXT_LENGTH} characters.")
        return value

    if kind == CustomPropertyType.NUMBER:
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            raise ValidationError("Expected a number.")
        try:
            number = float(value)
        except ValueError:
            raise ValidationError("Expected a number.")
        if not math.isfinite(number):
            raise ValidationError("Expected a finite number.")
        return int(number) if number.is_integer() else number

    if kind == CustomPropertyType.DATE:
        if not isinstance(value, str):
            raise ValidationError("Expected a date (YYYY-MM-DD).")
        try:
            return date.fromisoformat(value[:10]).isoformat()
        except ValueError:
            raise ValidationError("Expected a date (YYYY-MM-DD).")

    if kind == CustomPropertyType.CHECKBOX:
        if not isinstance(value, bool):
            raise ValidationError("Expected true or false.")
        return value

    if kind == CustomPropertyType.URL:
        if not isinstance(value, str):
            raise ValidationError("Expected a URL.")
        url = value.strip()
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        try:
            URLValidator(schemes=["http", "https"])(url)
        except ValidationError:
            raise ValidationError("Expected a valid URL.")
        return url

    option_ids = {option["id"] for option in prop.options or []}
    if kind == CustomPropertyType.SELECT:
        if not isinstance(value, str) or value not in option_ids:
            raise ValidationError("Unknown option.")
        return value

    if kind == CustomPropertyType.MULTI_SELECT:
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValidationError("Expected a list of options.")
        if not set(value) <= option_ids:
            raise ValidationError("Unknown option.")
        return list(dict.fromkeys(value)) or None

    if kind == CustomPropertyType.MEMBER:
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValidationError("Expected a list of members.")
        member_ids = list(dict.fromkeys(valid_uuids(value)))
        if len(member_ids) != len(set(value)):
            raise ValidationError("Expected a list of members.")
        valid = set(
            str(member_id)
            for member_id in ProjectMember.objects.filter(
                project_id=prop.project_id, member_id__in=member_ids, is_active=True
            ).values_list("member_id", flat=True)
        )
        if valid != set(member_ids):
            raise ValidationError("Members must belong to the project.")
        return member_ids or None

    raise ValidationError("Unknown property type.")


def display_value(prop, value):
    """Human-readable rendering of a stored value, used in the activity log."""
    if value is None:
        return ""
    kind = prop.property_type
    if kind in (CustomPropertyType.SELECT, CustomPropertyType.MULTI_SELECT):
        names = {option["id"]: option["name"] for option in prop.options or []}
        ids = value if isinstance(value, list) else [value]
        return ", ".join(names.get(option_id, "") for option_id in ids if option_id in names)
    if kind == CustomPropertyType.CHECKBOX:
        return "Yes" if value else "No"
    if kind == CustomPropertyType.MEMBER:
        users = User.objects.filter(id__in=valid_uuids(value)).values_list("display_name", flat=True)
        return ", ".join(users)
    return str(value)


def valid_uuids(values):
    valid = []
    for value in values:
        try:
            valid.append(str(UUID(str(value))))
        except ValueError:
            continue
    return valid
