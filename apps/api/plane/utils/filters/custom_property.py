# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Rich-filter conditions on work item custom properties.

Keys look like ``customproperty_<property uuid>__in`` (the shape the web filter adapter
sends) with the chosen values, comma-separated or as a list:

* select: option ids, matching items whose value is one of them
* multi select / people: option or user ids, matching items whose value contains any
* checkbox: "true" and/or "false"
"""

# Python imports
import re
from functools import reduce
from operator import or_

# Django imports
from django.db.models import Q
from rest_framework.exceptions import ValidationError

# Module imports
from plane.db.models import CustomProperty, CustomPropertyType, IssueCustomPropertyValue

PREFIX = "customproperty_"
KEY_PATTERN = re.compile(r"^customproperty_([0-9a-fA-F-]{36})__(in|exact)$")
FILTERABLE_TYPES = {
    CustomPropertyType.SELECT,
    CustomPropertyType.MULTI_SELECT,
    CustomPropertyType.MEMBER,
    CustomPropertyType.CHECKBOX,
}


def is_custom_property_key(key):
    return isinstance(key, str) and key.startswith(PREFIX)


def validate_custom_property_key(key):
    if not KEY_PATTERN.match(key):
        raise ValidationError({"message": f"Filtering on field '{key}' is not allowed", "code": "invalid_filter_field"})


def _values(raw):
    items = raw if isinstance(raw, (list, tuple)) else str(raw).split(",")
    return [str(item).strip() for item in items if str(item).strip()]


def build_custom_property_q(conditions, project_ids=None):
    """AND of the given custom property conditions, as a Q on Issue."""
    parsed = []
    for key, raw in conditions.items():
        validate_custom_property_key(key)
        parsed.append((KEY_PATTERN.match(key).group(1).lower(), _values(raw)))

    properties = CustomProperty.objects.filter(id__in=[pid for pid, _ in parsed])
    if project_ids is not None:
        properties = properties.filter(project_id__in=project_ids)
    properties = {str(p.id): p for p in properties}

    combined = Q()
    for property_id, values in parsed:
        prop = properties.get(property_id)
        if prop is None or prop.property_type not in FILTERABLE_TYPES or not values:
            # Unknown or unfilterable property: nothing can match
            combined &= Q(pk__in=[])
            continue
        rows = IssueCustomPropertyValue.objects.filter(property=prop)
        if prop.property_type == CustomPropertyType.CHECKBOX:
            wanted = {value.lower() in ("true", "1", "yes") for value in values}
            checked = rows.filter(value=True).values("issue_id")
            if wanted == {True}:
                combined &= Q(id__in=checked)
            elif wanted == {False}:
                combined &= ~Q(id__in=checked)
            continue
        if prop.property_type == CustomPropertyType.SELECT:
            match = reduce(or_, (Q(value=value) for value in values))
        else:
            match = reduce(or_, (Q(value__contains=[value]) for value in values))
        combined &= Q(id__in=rows.filter(match).values("issue_id"))
    return combined
