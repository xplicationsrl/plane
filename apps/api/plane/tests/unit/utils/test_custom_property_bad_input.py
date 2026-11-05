# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.core.exceptions import ValidationError

from plane.db.models import CustomProperty
from plane.utils.custom_property import normalize_value


@pytest.mark.unit
class TestNormalizeValueBadInput:
    @pytest.mark.parametrize("value", [10**400, "1e999", "abc"])
    def test_number_too_big_or_invalid_is_a_validation_error(self, value):
        with pytest.raises(ValidationError):
            normalize_value(CustomProperty(property_type="number"), value)

    @pytest.mark.parametrize("kind", ["text", "url"])
    def test_nul_is_a_validation_error(self, kind):
        with pytest.raises(ValidationError):
            normalize_value(CustomProperty(property_type=kind), "example.com\x00")
