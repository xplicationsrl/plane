/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
// plane imports
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import type { IPartialProject, ISearchIssueResponse, IState, TIssue } from "@plane/types";

export const getUpdateFormDataForReset = (projectId: string | null | undefined, formData: Partial<TIssue>) => ({
  ...DEFAULT_WORK_ITEM_FORM_VALUES,
  project_id: projectId,
  name: formData.name,
  description_html: formData.description_html,
  priority: formData.priority,
  start_date: formData.start_date,
  target_date: formData.target_date,
});

export const convertWorkItemDataToSearchResponse = (
  workspaceSlug: string,
  workItem: TIssue,
  project: IPartialProject | undefined,
  state: IState | undefined
): ISearchIssueResponse => ({
  id: workItem.id,
  name: workItem.name,
  project_id: workItem.project_id ?? "",
  project__identifier: project?.identifier ?? "",
  project__name: project?.name ?? "",
  sequence_id: workItem.sequence_id,
  type_id: workItem.type_id ?? "",
  state__color: state?.color ?? "",
  start_date: workItem.start_date,
  state__group: state?.group ?? "backlog",
  state__name: state?.name ?? "",
  workspace__slug: workspaceSlug,
});

export function getChangedIssuefields(formData: Partial<TIssue>, dirtyFields: { [key: string]: boolean | undefined }) {
  const changedFields = {};

  const dirtyFieldKeys = Object.keys(dirtyFields) as (keyof TIssue)[];
  for (const dirtyField of dirtyFieldKeys) {
    if (dirtyFields[dirtyField]) {
      set(changedFields, [dirtyField], formData[dirtyField]);
    }
  }

  return changedFields as Partial<TIssue>;
}

/** Create-form fields a work item template fills in. */
export const WORK_ITEM_TEMPLATE_FORM_FIELDS = [
  "name",
  "description_html",
  "priority",
  "state_id",
  "assignee_ids",
  "label_ids",
  "module_ids",
  "estimate_point",
] as const satisfies readonly (keyof TIssue)[];

export type TWorkItemTemplateFormField = (typeof WORK_ITEM_TEMPLATE_FORM_FIELDS)[number];

const isBlankHtml = (html: string) => html.replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>|<br\s*\/?>|\s|&nbsp;/g, "") === "";

const normalizeFormValue = (field: TWorkItemTemplateFormField, value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  // Sorts a copy; toSorted is skipped for older browsers
  // oxlint-disable-next-line unicorn/no-array-sort
  if (Array.isArray(value)) return value.length ? [...value].sort().join(",") : null;
  if (typeof value === "string") {
    if (field === "description_html") return isBlankHtml(value) ? null : value;
    return value === "" ? null : value;
  }
  return value;
};

/** Compares two form values the way a user sees them: empty is empty, and id lists ignore order. */
export const isSameWorkItemFormValue = (field: TWorkItemTemplateFormField, a: unknown, b: unknown) =>
  normalizeFormValue(field, a) === normalizeFormValue(field, b);

export type TMergeWorkItemTemplateValuesArgs = {
  /** What the form holds right now. */
  current: Partial<TIssue>;
  /** What the form starts with when no template is applied. */
  defaults: Partial<TIssue>;
  /** What the previously applied template put in, if one was applied. */
  previous: Partial<TIssue> | null;
  /** What the newly picked template wants; null when switching to "No template". */
  next: Partial<TIssue> | null;
};

/**
 * Works out the create form's values when a template is picked, switched or removed.
 * A field still holding its default or the previous template's value is the template's to fill.
 * Anything else the user typed or picked themselves, so it is kept. `kept` lists the kept fields
 * where the new template had something different to offer.
 */
export function mergeWorkItemTemplateValues({ current, defaults, previous, next }: TMergeWorkItemTemplateValuesArgs) {
  const values: Partial<TIssue> = {};
  const kept: TWorkItemTemplateFormField[] = [];
  WORK_ITEM_TEMPLATE_FORM_FIELDS.forEach((field) => {
    const value = current[field];
    const isTemplateOwned =
      isSameWorkItemFormValue(field, value, defaults[field]) ||
      (!!previous && isSameWorkItemFormValue(field, value, previous[field]));
    const target = next ? next[field] : defaults[field];
    if (isTemplateOwned) {
      set(values, field, target);
      return;
    }
    set(values, field, value);
    if (
      next &&
      !isSameWorkItemFormValue(field, target, value) &&
      !isSameWorkItemFormValue(field, target, defaults[field])
    )
      kept.push(field);
  });
  return { values, kept };
}
