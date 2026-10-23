# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Rich-filter conditions on custom properties (``customproperty_<id>__in``)."""

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from plane.db.models import CustomProperty, Issue, IssueCustomPropertyValue, Project
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet

VIEW = SimpleNamespace(filterset_class=IssueFilterSet)


def _filter(queryset, expression):
    request = Request(APIRequestFactory().get("/", {"filters": json.dumps(expression)}))
    names = ComplexFilterBackend().filter_queryset(request, queryset, VIEW).values_list("name", flat=True)
    return sorted(names)


@pytest.fixture
def project(db, workspace, create_user):
    return Project.objects.create(
        name="Filters", identifier=f"F{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
    )


@pytest.fixture
def props(db, project):
    options = [{"id": "a", "name": "A", "color": "#000000"}, {"id": "b", "name": "B", "color": "#000000"}]
    return {
        "tier": CustomProperty.objects.create(name="Tier", property_type="select", options=options, project=project),
        "tags": CustomProperty.objects.create(
            name="Tags", property_type="multi_select", options=options, project=project
        ),
        "vip": CustomProperty.objects.create(name="VIP", property_type="checkbox", project=project),
        "notes": CustomProperty.objects.create(name="Notes", property_type="text", project=project),
    }


@pytest.fixture
def issues(db, workspace, project, props):
    def make(name, **values):
        issue = Issue.objects.create(name=name, project=project, workspace=workspace)
        for key, value in values.items():
            IssueCustomPropertyValue.objects.create(issue=issue, property=props[key], value=value, project=project)
        return issue

    make("one", tier="a", tags=["a"], vip=True)
    make("two", tier="b", tags=["a", "b"])
    Issue.objects.filter(pk=make("three").pk).update(priority="urgent")
    return Issue.objects.filter(project=project)


def key(prop):
    return f"customproperty_{prop.id}__in"


@pytest.mark.contract
class TestCustomPropertyFilters:
    def test_select_matches_any_of_the_options(self, issues, props):
        assert _filter(issues, {key(props["tier"]): "a"}) == ["one"]
        assert _filter(issues, {key(props["tier"]): "a,b"}) == ["one", "two"]

    def test_multi_select_matches_items_containing_an_option(self, issues, props):
        assert _filter(issues, {key(props["tags"]): "b"}) == ["two"]
        assert _filter(issues, {key(props["tags"]): "a"}) == ["one", "two"]

    def test_checkbox(self, issues, props):
        assert _filter(issues, {key(props["vip"]): "true"}) == ["one"]
        assert _filter(issues, {key(props["vip"]): "false"}) == ["three", "two"]

    def test_combines_with_regular_filters_and_logic(self, issues, props):
        expression = {"or": [{key(props["tier"]): "b"}, {"priority__in": "urgent"}]}
        assert _filter(issues, expression) == ["three", "two"]
        assert _filter(issues, {"not": {key(props["tier"]): "a"}}) == ["three", "two"]

    def test_unfilterable_or_unknown_property_matches_nothing(self, issues, props):
        assert _filter(issues, {key(props["notes"]): "x"}) == []
        assert _filter(issues, {f"customproperty_{uuid4()}__in": "a"}) == []

    def test_malformed_key_is_rejected(self, issues):
        with pytest.raises(ValidationError):
            _filter(issues, {"customproperty_nope__in": "a"})


@pytest.mark.contract
class TestDateCustomPropertyFilters:
    @pytest.fixture
    def due(self, db, workspace, project):
        prop = CustomProperty.objects.create(name="Review on", property_type="date", project=project)
        for name, day in (("early", "2026-01-10"), ("mid", "2026-03-15"), ("late", "2026-06-01")):
            issue = Issue.objects.create(name=name, project=project, workspace=workspace)
            IssueCustomPropertyValue.objects.create(issue=issue, property=prop, value=day, project=project)
        Issue.objects.create(name="none", project=project, workspace=workspace)
        return prop, Issue.objects.filter(project=project)

    def test_exact_date(self, due):
        prop, issues = due
        assert _filter(issues, {f"customproperty_{prop.id}__exact": "2026-03-15"}) == ["mid"]

    def test_date_range_is_inclusive(self, due):
        prop, issues = due
        assert _filter(issues, {f"customproperty_{prop.id}__range": "2026-01-10,2026-03-15"}) == ["early", "mid"]

    def test_invalid_dates_match_nothing(self, due):
        prop, issues = due
        assert _filter(issues, {f"customproperty_{prop.id}__range": "soon,later"}) == []
