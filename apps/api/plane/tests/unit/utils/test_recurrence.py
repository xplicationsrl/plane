# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

import pytest

from plane.utils.recurrence import add_months, next_occurrence


@pytest.mark.unit
class TestAddMonths:
    @pytest.mark.parametrize(
        "day,months,expected",
        [
            (date(2026, 1, 15), 1, date(2026, 2, 15)),
            (date(2026, 1, 31), 1, date(2026, 2, 28)),
            (date(2028, 1, 31), 1, date(2028, 2, 29)),
            (date(2026, 11, 30), 3, date(2027, 2, 28)),
            (date(2026, 12, 1), 12, date(2027, 12, 1)),
        ],
    )
    def test_add_months(self, day, months, expected):
        assert add_months(day, months) == expected


@pytest.mark.unit
class TestNextOccurrence:
    def test_daily(self):
        assert next_occurrence(date(2026, 10, 23), "daily") == date(2026, 10, 24)
        assert next_occurrence(date(2026, 10, 23), "daily", interval=3) == date(2026, 10, 26)

    def test_weekly_defaults_to_same_weekday(self):
        # 2026-10-23 is a Friday
        assert next_occurrence(date(2026, 10, 23), "weekly") == date(2026, 10, 30)
        assert next_occurrence(date(2026, 10, 23), "weekly", interval=2) == date(2026, 11, 6)

    def test_weekly_on_chosen_days_finishes_the_week_first(self):
        # Mon/Wed/Fri: after Monday comes Wednesday the same week
        assert next_occurrence(date(2026, 10, 19), "weekly", weekdays=[0, 2, 4]) == date(2026, 10, 21)
        # After Friday the rule wraps to Monday of the next active week
        assert next_occurrence(date(2026, 10, 23), "weekly", weekdays=[0, 2, 4]) == date(2026, 10, 26)
        assert next_occurrence(date(2026, 10, 23), "weekly", interval=2, weekdays=[0, 2, 4]) == date(2026, 11, 2)

    def test_monthly_keeps_its_anchor_day_after_a_short_month(self):
        feb = next_occurrence(date(2026, 1, 31), "monthly", anchor_day=31)
        assert feb == date(2026, 2, 28)
        assert next_occurrence(feb, "monthly", anchor_day=31) == date(2026, 3, 31)

    def test_yearly_handles_leap_day(self):
        assert next_occurrence(date(2028, 2, 29), "yearly", anchor_day=29) == date(2029, 2, 28)
        assert next_occurrence(date(2029, 2, 28), "yearly", interval=3, anchor_day=29) == date(2032, 2, 29)

    def test_unknown_frequency(self):
        with pytest.raises(ValueError):
            next_occurrence(date(2026, 1, 1), "hourly")
