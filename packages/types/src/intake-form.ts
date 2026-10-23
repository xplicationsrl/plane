/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** "description" | "priority" | "submitter_name" | "submitter_email" | `property:${id}` */
export type TIntakeFormFieldKey = string;

export type TIntakeFormField = {
  key: TIntakeFormFieldKey;
  /** Overrides the default label; empty uses the field's own name. */
  label: string;
  help_text: string;
  required: boolean;
};

export type TIntakeForm = {
  id: string;
  name: string;
  description: string;
  /** Public link token: /forms/<anchor>. */
  anchor: string;
  is_active: boolean;
  fields: TIntakeFormField[];
  success_message: string;
  submission_count: number;
  project: string;
  created_at: string;
  updated_at: string;
};

export type TPublicIntakeFormFieldType =
  | "textarea"
  | "priority"
  | "text"
  | "email"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "checkbox"
  | "url";

export type TPublicIntakeFormField = TIntakeFormField & {
  type: TPublicIntakeFormFieldType;
  options?: { id: string; name: string }[];
};

export type TPublicIntakeForm = {
  name: string;
  description: string;
  success_message: string;
  project_name: string;
  fields: TPublicIntakeFormField[];
};
