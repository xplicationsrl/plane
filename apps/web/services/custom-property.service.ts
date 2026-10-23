/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TCustomProperty, TCustomPropertyValue, TIssueCustomPropertyValues } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class CustomPropertyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TCustomProperty[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/custom-properties/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<TCustomProperty>): Promise<TCustomProperty> {
    return this.post(`${this.base(workspaceSlug, projectId)}/custom-properties/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TCustomProperty>
  ): Promise<TCustomProperty> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/custom-properties/${propertyId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, propertyId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/custom-properties/${propertyId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getIssueValues(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueCustomPropertyValues> {
    return this.get(`${this.base(workspaceSlug, projectId)}/issues/${issueId}/custom-property-values/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Record<string, TCustomPropertyValue>
  ): Promise<TIssueCustomPropertyValues> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/issues/${issueId}/custom-property-values/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
