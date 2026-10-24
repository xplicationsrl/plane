# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Rich-filter conditions on work item custom properties.

Keys look like ``customproperty_<property uuid>__in`` (the shape the web filter adapter
sends) with the chosen values, comma-separated or as a list:

* select: option ids, matching items whose value is one of them
* multi select / people: option or user ids, matching items whose value contains any
* checkbox: "true" and/or "false"
* date: ``__exact`` with one date, or ``__range`` with "start,end" (YYYY-MM-DD)
* number: ``__exact`` with one number, or ``__range`` with "min,max" (either side may be empty)
* text / URL: ``__icontains`` with the text to look for
"""

# Python imports
import re
from decimal import Decimal, InvalidOperation
from functools import reduce
from operator import or_

# Django imports
from django.db.models import CharField, DecimalField, F, Func, Q
from rest_framework.exceptions import ValidationError

# Module imports
from plane.db.models import CustomProperty, CustomPropertyType, IssueCustomPropertyValue

PREFIX = "customproperty_"
KEY_PATTERN = re.compile(r"^customproperty_([0-9a-fA-F-]{36})__(in|exact|range|icontains)$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FILTERABLE_TYPES = {
    CustomPropertyType.SELECT,
    CustomPropertyType.MULTI_SELECT,
    CustomPropertyType.MEMBER,
    CustomPropertyType.CHECKBOX,
    CustomPropertyType.DATE,
    CustomPropertyType.NUMBER,
    CustomPropertyType.TEXT,
    CustomPropertyType.URL,
}


def _json_text(field):
    """A top-level JSON string as text (``"2026-10-23"`` -> ``2026-10-23``)."""
    return Func(F(field), template="(%(expressions)s #>> '{}')", output_field=CharField())


def _json_number(field):
    """A JSON number (or numeric string) as numeric; NULL for anything else, so the cast can't fail."""
    return Func(
        F(field),
        template=(
            "(CASE WHEN (%(expressions)s #>> '{}') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?\\s*$' "
            "THEN (%(expressions)s #>> '{}')::numeric END)"
        ),
        output_field=DecimalField(),
    )


def is_custom_property_key(key):
    return isinstance(key, str) and key.startswith(PREFIX)


def validate_custom_property_key(key):
    if not KEY_PATTERN.match(key):
        raise ValidationError({"message": f"Filtering on field '{key}' is not allowed", "code": "invalid_filter_field"})


def _values(raw):
    items = raw if isinstance(raw, (list, tuple)) else str(raw).split(",")
    return [str(item).strip() for item in items if str(item).strip()]


def _numbers(raw):
    """Positional numbers ("10,", ",20", "5"), None for an empty or unreadable side."""
    items = raw if isinstance(raw, (list, tuple)) else str(raw).split(",")
    numbers = []
    for item in list(items)[:2]:
        text = str(item).strip()
        try:
            numbers.append(Decimal(text) if text else None)
        except InvalidOperation:
            numbers.append(None)
    return numbers


def build_custom_property_q(conditions, project_ids=None):
    """AND of the given custom property conditions, as a Q on Issue."""
    parsed = []
    for key, raw in conditions.items():
        validate_custom_property_key(key)
        match = KEY_PATTERN.match(key)
        parsed.append((match.group(1).lower(), match.group(2), raw))

    properties = CustomProperty.objects.filter(id__in=[pid for pid, _, _ in parsed])
    if project_ids is not None:
        properties = properties.filter(project_id__in=project_ids)
    properties = {str(p.id): p for p in properties}

    combined = Q()
    for property_id, operator, raw in parsed:
        values = _values(raw)
        prop = properties.get(property_id)
        if prop is None or prop.property_type not in FILTERABLE_TYPES or not values:
            # Unknown or unfilterable property: nothing can match
            combined &= Q(pk__in=[])
            continue
        rows = IssueCustomPropertyValue.objects.filter(property=prop)
        if prop.property_type in (CustomPropertyType.TEXT, CustomPropertyType.URL):
            # Text may contain commas, so it is taken whole rather than split
            text = str(raw[0] if isinstance(raw, (list, tuple)) else raw).strip()
            rows = rows.annotate(value_text=_json_text("value"))
            combined &= Q(id__in=rows.filter(value_text__icontains=text).values("issue_id"))
            continue
        if prop.property_type == CustomPropertyType.NUMBER:
            low, high = (_numbers(raw) + [None, None])[:2]
            if operator != "range":
                high = low
            if low is None and high is None:
                combined &= Q(pk__in=[])
                continue
            rows = rows.annotate(value_number=_json_number("value"))
            match = Q()
            if low is not None:
                match &= Q(value_number__gte=low)
            if high is not None:
                match &= Q(value_number__lte=high)
            combined &= Q(id__in=rows.filter(match).values("issue_id"))
            continue
        if prop.property_type == CustomPropertyType.DATE:
            dates = [value[:10] for value in values if DATE_PATTERN.match(value[:10])]
            if not dates:
                combined &= Q(pk__in=[])
                continue
            rows = rows.annotate(date_text=_json_text("value"))
            if operator == "range":
                start, end = (dates + dates)[:2] if len(dates) == 1 else sorted(dates[:2])
                match = Q(date_text__gte=start, date_text__lte=end)
            else:
                match = Q(date_text__in=dates)
            combined &= Q(id__in=rows.filter(match).values("issue_id"))
            continue
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
