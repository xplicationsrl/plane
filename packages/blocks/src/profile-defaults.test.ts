/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { PROFILE_ADMINS_TAB, PROFILE_DEFAULT_RICH_FILTERS, PROFILE_VIEWER_TAB } from "@plane/constants";

describe("profile tabs", () => {
  it("shows assigned first and summary second for workspace members", () => {
    expect(PROFILE_ADMINS_TAB.map((tab) => tab.key)).toEqual([
      "assigned",
      "summary",
      "created",
      "subscribed",
      "activity",
    ]);
  });

  it("only shows summary to viewers", () => {
    expect(PROFILE_VIEWER_TAB.map((tab) => tab.key)).toEqual(["summary"]);
  });
});

describe("profile default filters", () => {
  it("hides only completed work items", () => {
    expect(PROFILE_DEFAULT_RICH_FILTERS).toEqual({ state_group__in: "backlog,unstarted,started,cancelled" });
  });
});
