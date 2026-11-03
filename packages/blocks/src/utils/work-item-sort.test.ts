/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { getReorderedSortOrders, getWorkItemColorRank, getWorkItemDoneRank, moveWorkItemId } from "@plane/utils";

describe("getWorkItemDoneRank", () => {
  it("puts done work last by default", () => {
    expect(getWorkItemDoneRank("started")).toBeLessThan(getWorkItemDoneRank("completed"));
    expect(getWorkItemDoneRank("completed")).toBeLessThan(getWorkItemDoneRank("cancelled"));
  });

  it("puts completed work ahead of cancelled work when done comes first", () => {
    expect(getWorkItemDoneRank("completed", true)).toBe(0);
    expect(getWorkItemDoneRank("cancelled", true)).toBe(1);
    expect(getWorkItemDoneRank("backlog", true)).toBe(4);
  });

  it("sorts an unknown group last either way", () => {
    expect(getWorkItemDoneRank(undefined)).toBe(5);
    expect(getWorkItemDoneRank(null, true)).toBe(5);
  });
});

describe("getWorkItemColorRank", () => {
  it("follows the palette and puts uncolored work last", () => {
    expect(getWorkItemColorRank("red")).toBe(0);
    expect(getWorkItemColorRank("blue")).toBeLessThan(getWorkItemColorRank("pink"));
    expect(getWorkItemColorRank(null)).toBeGreaterThan(getWorkItemColorRank("pink"));
  });
});

describe("getReorderedSortOrders", () => {
  it("reuses the existing values in the new order", () => {
    const items = [
      { id: "a", sort_order: 100 },
      { id: "b", sort_order: 200 },
      { id: "c", sort_order: 300 },
    ];
    expect(getReorderedSortOrders(items, ["c", "a", "b"])).toEqual({ c: 100, a: 200, b: 300 });
  });

  it("pushes tied values apart", () => {
    const items = [
      { id: "a", sort_order: 5 },
      { id: "b", sort_order: 5 },
      { id: "c", sort_order: 5 },
    ];
    expect(getReorderedSortOrders(items, ["b", "c", "a"])).toEqual({ b: 5, c: 6, a: 7 });
  });
});

describe("moveWorkItemId", () => {
  it("moves above or below the target", () => {
    expect(moveWorkItemId(["a", "b", "c"], "c", "a", "top")).toEqual(["c", "a", "b"]);
    expect(moveWorkItemId(["a", "b", "c"], "a", "b", "bottom")).toEqual(["b", "a", "c"]);
  });

  it("leaves the list alone when an id is missing", () => {
    expect(moveWorkItemId(["a", "b"], "x", "a", "top")).toEqual(["a", "b"]);
    expect(moveWorkItemId(["a", "b"], "a", "x", "top")).toEqual(["a", "b"]);
  });
});
