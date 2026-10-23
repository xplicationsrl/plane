/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "./issues";
import type { TCustomPropertyValue } from "./custom-property";

export type TWorkItemTemplateSubItem = {
  name: string;
  description_html: string;
  priority: TIssuePriorities;
  assignee_ids: string[];
  label_ids: string[];
};

/** The prefilled fields of a work item template, sanitized against its project. */
export type TWorkItemTemplateData = TWorkItemTemplateSubItem & {
  state_id: string | null;
  estimate_point_id: string | null;
  module_ids: string[];
  custom_properties: Record<string, TCustomPropertyValue>;
  sub_issues: TWorkItemTemplateSubItem[];
};

export type TWorkItemTemplate = {
  id: string;
  name: string;
  description: string;
  template: TWorkItemTemplateData;
  project: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TProjectTemplate = {
  id: string;
  name: string;
  description: string;
  /** How many of each part the template carries. */
  summary: Record<"states" | "labels" | "custom_properties" | "work_item_templates" | "work_items", number>;
  created_by: string;
  created_at: string;
  updated_at: string;
};
