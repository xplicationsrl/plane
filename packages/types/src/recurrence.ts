/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** The occurrence that followed a completed one: the rule now lives there. */
export type TRecurrenceContinuation = {
  id: string;
  name: string;
  project_id: string;
  project_identifier: string;
  sequence_id: number;
  /** When it was created (ISO datetime). */
  continued_at: string;
};

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
  /** Set when read from an earlier occurrence; the rule's `issue` is then a later work item. */
  continued_in: TRecurrenceContinuation | null;
};

export type TIssueRecurrencePayload = Pick<TIssueRecurrence, "frequency" | "interval" | "weekdays" | "ends_on">;
