/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TCustomPropertyType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "checkbox"
  | "url"
  | "member";

export type TCustomPropertyOption = {
  id: string;
  name: string;
  color: string;
};

export type TCustomProperty = {
  id: string;
  name: string;
  description: string;
  property_type: TCustomPropertyType;
  /** Choices of select and multi-select fields; values reference option ids. */
  options: TCustomPropertyOption[];
  sort_order: number;
  is_active: boolean;
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};

/**
 * Stored value per type: text/url/date (YYYY-MM-DD)/select (option id) → string,
 * number → number, checkbox → boolean, multi_select (option ids)/member (user ids) → string[].
 */
export type TCustomPropertyValue = string | number | boolean | string[] | null;

/** Values of one work item, keyed by custom property id. */
export type TIssueCustomPropertyValues = Record<string, TCustomPropertyValue>;
