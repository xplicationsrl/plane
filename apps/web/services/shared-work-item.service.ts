/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TSharedWorkItem } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class SharedWorkItemService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getLinkedProjects(workspaceSlug: string, projectId: string, issueId: string): Promise<string[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/linked-projects/`)
      .then((res) => res?.data?.project_ids ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async setLinkedProjects(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    projectIds: string[]
  ): Promise<string[]> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/linked-projects/`, {
      project_ids: projectIds,
    })
      .then((res) => res?.data?.project_ids ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getSharedWorkItems(workspaceSlug: string, projectId: string): Promise<TSharedWorkItem[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/shared-issues/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
