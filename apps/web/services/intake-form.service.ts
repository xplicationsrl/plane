/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIntakeForm } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TIntakeFormPayload = Partial<
  Pick<TIntakeForm, "name" | "description" | "is_active" | "fields" | "success_message">
>;

export class IntakeFormService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-forms/`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIntakeForm[]> {
    return this.get(this.base(workspaceSlug, projectId))
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TIntakeFormPayload): Promise<TIntakeForm> {
    return this.post(this.base(workspaceSlug, projectId), data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    formId: string,
    data: TIntakeFormPayload
  ): Promise<TIntakeForm> {
    return this.patch(`${this.base(workspaceSlug, projectId)}${formId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, formId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}${formId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
