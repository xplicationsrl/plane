/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { isSameWorkItemFormValue, mergeWorkItemTemplateValues } from "@plane/utils";

const defaults: Partial<TIssue> = { ...DEFAULT_WORK_ITEM_FORM_VALUES, project_id: "p1" };
const templateA: Partial<TIssue> = {
  name: "Bug report",
  description_html: "<p>Steps to reproduce</p>",
  priority: "high",
  state_id: "s-todo",
  assignee_ids: ["u1"],
  label_ids: ["l-bug"],
  module_ids: null,
  estimate_point: null,
};
const templateB: Partial<TIssue> = {
  name: "Feature request",
  description_html: "<p>Problem</p>",
  priority: "low",
  state_id: "s-backlog",
  assignee_ids: [],
  label_ids: ["l-feature"],
  module_ids: ["m1"],
  estimate_point: null,
};

describe("isSameWorkItemFormValue", () => {
  it("treats every kind of empty as empty", () => {
    expect(isSameWorkItemFormValue("module_ids", null, [])).toBe(true);
    expect(isSameWorkItemFormValue("state_id", "", undefined)).toBe(true);
    expect(isSameWorkItemFormValue("description_html", "", "<p></p>")).toBe(true);
    expect(isSameWorkItemFormValue("description_html", "<p><br></p>", "")).toBe(true);
    expect(isSameWorkItemFormValue("description_html", "<p>x</p>", "")).toBe(false);
  });

  it("ignores the order of id lists", () => {
    expect(isSameWorkItemFormValue("label_ids", ["a", "b"], ["b", "a"])).toBe(true);
    expect(isSameWorkItemFormValue("label_ids", ["a"], ["a", "b"])).toBe(false);
  });
});

describe("mergeWorkItemTemplateValues", () => {
  it("fills an untouched form with the template", () => {
    const { values, kept } = mergeWorkItemTemplateValues({
      current: defaults,
      defaults,
      previous: null,
      next: templateA,
    });
    expect(values).toMatchObject(templateA);
    expect(kept).toEqual([]);
  });

  it("keeps what the user typed before picking a template and reports it", () => {
    const current = { ...defaults, name: "Login page is blank", description_html: "<p>Since this morning</p>" };
    const { values, kept } = mergeWorkItemTemplateValues({ current, defaults, previous: null, next: templateA });
    expect(values.name).toBe("Login page is blank");
    expect(values.description_html).toBe("<p>Since this morning</p>");
    expect(values.priority).toBe("high");
    expect(values.label_ids).toEqual(["l-bug"]);
    expect(kept).toEqual(["name", "description_html"]);
  });

  it("swaps one template's values for another's but keeps the user's edits", () => {
    // Template A applied, then the user changed the priority themselves
    const current = { ...defaults, ...templateA, priority: "urgent" as const };
    const { values, kept } = mergeWorkItemTemplateValues({ current, defaults, previous: templateA, next: templateB });
    expect(values.name).toBe("Feature request");
    expect(values.description_html).toBe("<p>Problem</p>");
    expect(values.label_ids).toEqual(["l-feature"]);
    expect(values.module_ids).toEqual(["m1"]);
    expect(values.priority).toBe("urgent");
    expect(kept).toEqual(["priority"]);
  });

  it("takes the template's values back out on No template, keeping the user's edits", () => {
    const current = { ...defaults, ...templateA, name: "Login page is blank" };
    const { values, kept } = mergeWorkItemTemplateValues({ current, defaults, previous: templateA, next: null });
    expect(values.name).toBe("Login page is blank");
    expect(values.description_html).toBe(defaults.description_html);
    expect(values.priority).toBe("none");
    expect(values.label_ids).toEqual([]);
    expect(kept).toEqual([]);
  });

  it("restores what the user typed when they pick a template and then No template", () => {
    const typed = { ...defaults, name: "Login page is blank" };
    const applied = mergeWorkItemTemplateValues({ current: typed, defaults, previous: null, next: templateA }).values;
    const { values } = mergeWorkItemTemplateValues({
      current: { ...typed, ...applied },
      defaults,
      previous: templateA,
      next: null,
    });
    expect(values.name).toBe("Login page is blank");
    expect(values.priority).toBe("none");
  });

  it("does not report a kept field when the template leaves it empty", () => {
    const current = { ...defaults, assignee_ids: ["u9"] };
    const { values, kept } = mergeWorkItemTemplateValues({ current, defaults, previous: null, next: templateB });
    expect(values.assignee_ids).toEqual(["u9"]);
    expect(kept).toEqual([]);
  });
});
