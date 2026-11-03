/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
import { ISSUE_COLORS } from "@plane/constants";
import type { TIssueColor, TStateGroups } from "@plane/types";

const DONE_LAST_STATE_GROUPS: TStateGroups[] = ["backlog", "unstarted", "started", "completed", "cancelled"];
const DONE_FIRST_STATE_GROUPS: TStateGroups[] = ["completed", "cancelled", "started", "unstarted", "backlog"];

/** Sort rank for the "Done last" / "Done first" orders. An unknown group sorts last in both. */
export const getWorkItemDoneRank = (stateGroup: TStateGroups | null | undefined, doneFirst = false): number => {
  const groups = doneFirst ? DONE_FIRST_STATE_GROUPS : DONE_LAST_STATE_GROUPS;
  const rank = stateGroup ? groups.indexOf(stateGroup) : -1;
  return rank === -1 ? groups.length : rank;
};

/** Sort rank for the "Color" order: palette order, uncolored last. */
export const getWorkItemColorRank = (color: TIssueColor | null | undefined): number => {
  const rank = ISSUE_COLORS.findIndex((option) => option.key === color);
  return rank === -1 ? ISSUE_COLORS.length : rank;
};

/**
 * The sort_order each item gets when put in the given order. Mirrors SubIssueReorderEndpoint: the items'
 * existing values are reused, and tied values are pushed apart.
 */
export const getReorderedSortOrders = (
  workItems: { id: string; sort_order: number }[],
  orderedIds: string[]
): Record<string, number> => {
  const slots = sortBy(workItems.map((workItem) => workItem.sort_order));
  const sortOrders: Record<string, number> = {};
  let previous: number | undefined;
  orderedIds.forEach((id, index) => {
    const slot = slots[index];
    const sortOrder = previous === undefined || slot > previous ? slot : previous + 1;
    sortOrders[id] = sortOrder;
    previous = sortOrder;
  });
  return sortOrders;
};

/** The ids with sourceId moved to just above or below targetId. */
export const moveWorkItemId = (ids: string[], sourceId: string, targetId: string, edge: "top" | "bottom"): string[] => {
  const remaining = ids.filter((id) => id !== sourceId);
  const targetIndex = remaining.indexOf(targetId);
  if (targetIndex === -1 || remaining.length === ids.length) return ids;
  remaining.splice(edge === "top" ? targetIndex : targetIndex + 1, 0, sourceId);
  return remaining;
};
