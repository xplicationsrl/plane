# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Date arithmetic for recurring work items."""

# Python imports
import calendar
from datetime import date, timedelta

FREQUENCIES = ("daily", "weekly", "monthly", "yearly")


def add_months(day, months):
    """``day`` moved by ``months``, clamped to the last day of a shorter month (Jan 31 → Feb 28)."""
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def next_occurrence(after, frequency, interval=1, weekdays=None, anchor_day=None):
    """The first occurrence strictly after ``after``.

    ``weekdays`` (0 = Monday … 6 = Sunday) picks the days of a weekly rule; without
    it a weekly rule repeats on ``after``'s weekday. ``anchor_day`` keeps a monthly or
    yearly rule on its original day of the month after a short month clamped it.
    """
    interval = max(1, int(interval))
    if frequency == "daily":
        return after + timedelta(days=interval)

    if frequency == "weekly":
        days = sorted(set(weekdays or [after.weekday()]))
        week_start = after - timedelta(days=after.weekday())
        # The rest of this week first, then every `interval`-th week
        for day in days:
            if day > after.weekday():
                return week_start + timedelta(days=day)
        return week_start + timedelta(weeks=interval, days=days[0])

    if frequency in ("monthly", "yearly"):
        months = interval if frequency == "monthly" else interval * 12
        moved = add_months(after, months)
        if anchor_day and anchor_day != moved.day:
            last_day = calendar.monthrange(moved.year, moved.month)[1]
            moved = moved.replace(day=min(anchor_day, last_day))
        return moved

    raise ValueError(f"Unknown frequency: {frequency}")


def next_due_date(recurrence, issue, today):
    """When the occurrence after ``issue`` is due, or None once ``recurrence`` has ended.

    The schedule follows the due date (or the start date when there is none) and skips
    ahead past ``today``, so a task completed late doesn't come back already overdue.
    """
    rule = (recurrence.frequency, recurrence.interval, recurrence.weekdays, recurrence.anchor_day)
    following = next_occurrence(issue.target_date or issue.start_date or today, *rule)
    while following < today:
        following = next_occurrence(following, *rule)
    if recurrence.ends_on and following > recurrence.ends_on:
        return None
    return following
