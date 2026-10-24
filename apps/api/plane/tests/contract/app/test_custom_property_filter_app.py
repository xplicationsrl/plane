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


def _filter(queryset, expression, view=VIEW):
    request = Request(APIRequestFactory().get("/", {"filters": json.dumps(expression)}))
    names = ComplexFilterBackend().filter_queryset(request, queryset, view).values_list("name", flat=True)
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

    def test_properties_are_scoped_to_the_view_project(self, issues, props, workspace, create_user):
        other = Project.objects.create(
            name="Elsewhere", identifier=f"E{uuid4().hex[:4].upper()}", workspace=workspace, created_by=create_user
        )
        expression = {key(props["tier"]): "a"}

        def view(**kwargs):
            return SimpleNamespace(filterset_class=IssueFilterSet, kwargs=kwargs)

        assert _filter(issues, expression, view(slug=workspace.slug, project_id=props["tier"].project_id)) == ["one"]
        assert _filter(issues, expression, view(slug=workspace.slug)) == ["one"]
        assert _filter(issues, expression, view(slug=workspace.slug, project_id=other.id)) == []
        assert _filter(issues, expression, view(slug="another-workspace")) == []

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


@pytest.mark.contract
class TestTextAndNumberCustomPropertyFilters:
    @pytest.fixture
    def data(self, db, workspace, project):
        notes = CustomProperty.objects.create(name="Notes", property_type="text", project=project)
        site = CustomProperty.objects.create(name="Site", property_type="url", project=project)
        budget = CustomProperty.objects.create(name="Budget", property_type="number", project=project)
        rows = (
            ("alpha", "Call the Customer, then ship", "https://acme.example/a", 100),
            ("beta", "internal only", "https://other.example", 2.5),
            ("gamma", None, None, 5000),
        )
        for name, text, url, number in rows:
            issue = Issue.objects.create(name=name, project=project, workspace=workspace)
            for prop, value in ((notes, text), (site, url), (budget, number)):
                if value is not None:
                    IssueCustomPropertyValue.objects.create(issue=issue, property=prop, value=value, project=project)
        return notes, site, budget, Issue.objects.filter(project=project)

    def test_text_contains_is_case_insensitive_and_keeps_commas(self, data):
        notes, _, _, issues = data
        assert _filter(issues, {f"customproperty_{notes.id}__icontains": "customer, then"}) == ["alpha"]

    def test_url_contains(self, data):
        _, site, _, issues = data
        assert _filter(issues, {f"customproperty_{site.id}__icontains": "acme"}) == ["alpha"]

    def test_number_exact_and_ranges(self, data):
        _, _, budget, issues = data
        assert _filter(issues, {f"customproperty_{budget.id}__exact": "2.5"}) == ["beta"]
        assert _filter(issues, {f"customproperty_{budget.id}__range": "50,1000"}) == ["alpha"]
        assert _filter(issues, {f"customproperty_{budget.id}__range": ",100"}) == ["alpha", "beta"]
        assert _filter(issues, {f"customproperty_{budget.id}__range": "1000,"}) == ["gamma"]

    def test_unreadable_number_matches_nothing(self, data):
        _, _, budget, issues = data
        assert _filter(issues, {f"customproperty_{budget.id}__exact": "lots"}) == []

    def test_non_numeric_rows_do_not_break_number_filters(self, data, workspace, project):
        _, _, budget, issues = data
        odd = Issue.objects.create(name="odd", project=project, workspace=workspace)
        # Bypasses normalization, like a row written before validation existed
        IssueCustomPropertyValue.objects.create(issue=odd, property=budget, value="lots", project=project)

        assert _filter(issues, {f"customproperty_{budget.id}__range": "50,1000"}) == ["alpha"]
