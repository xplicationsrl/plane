/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProjectOrderByOptions =
  | "sort_order"
  | "name"
  | "-name"
  | "created_at"
  | "-created_at"
  | "members_length"
  | "-members_length";

/**
 * Which projects the projects page shows, by status. "not_done" covers backlog, todo and in progress;
 * "in_progress" is the in-progress part of it on its own.
 */
export type TProjectCompletionFilter = "not_done" | "in_progress" | "done" | "cancelled" | "all";

export type TProjectDisplayFilters = {
  my_projects?: boolean;
  archived_projects?: boolean;
  completion?: TProjectCompletionFilter;
  order_by?: TProjectOrderByOptions;
};

export type TProjectAppliedDisplayFilterKeys = "my_projects" | "archived_projects";

export type TProjectFilters = {
  access?: string[] | null;
  lead?: string[] | null;
  members?: string[] | null;
  created_at?: string[] | null;
};

export type TProjectStoredFilters = {
  display_filters?: TProjectDisplayFilters;
  filters?: TProjectFilters;
};
