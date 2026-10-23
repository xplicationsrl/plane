/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "./users";

export type TIssueTimeEntry = {
  id: string;
  issue: string;
  project: string;
  user: string;
  user_detail: IUserLite;
  /** Set for timers; null for manually logged time. */
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  /** The day the time counts for (YYYY-MM-DD). */
  logged_on: string;
  description: string;
  is_running: boolean;
  created_at: string;
};

export type TIssueTimeSummary = {
  /** Finished time only; a running timer counts once stopped. */
  total_seconds: number;
  entries: TIssueTimeEntry[];
};

export type TRunningTimeEntry = TIssueTimeEntry & {
  issue_detail: { id: string; name: string; sequence_id: number; project_identifier: string };
};
