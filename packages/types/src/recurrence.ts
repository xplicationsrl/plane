/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type TIssueRecurrence = {
  id: string;
  issue: string;
  frequency: TRecurrenceFrequency;
  /** Every N days/weeks/months/years. */
  interval: number;
  /** Weekly rules only: 0 = Monday … 6 = Sunday. */
  weekdays: number[];
  ends_on: string | null;
  is_active: boolean;
  occurrences: number;
  /** When the next occurrence would be due; null once the rule has ended. */
  next_due_on: string | null;
};

export type TIssueRecurrencePayload = Pick<TIssueRecurrence, "frequency" | "interval" | "weekdays" | "ends_on">;
