/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TProject, TProjectFolder, TProjectStatus } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

type TProjectStatusResponse = Pick<TProject, "status" | "reopened_at">;

/** Project folders, plus the two things a project card changes in place: its status and its folder. */
export class ProjectFolderService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TProjectFolder[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-folders/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Pick<TProjectFolder, "name">): Promise<TProjectFolder> {
    return this.post(`/api/workspaces/${workspaceSlug}/project-folders/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    folderId: string,
    data: Partial<Pick<TProjectFolder, "name" | "sort_order">>
  ): Promise<TProjectFolder> {
    return this.patch(`/api/workspaces/${workspaceSlug}/project-folders/${folderId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, folderId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/project-folders/${folderId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** `folderId: null` takes the project out of its folder. */
  async moveProject(
    workspaceSlug: string,
    projectId: string,
    folderId: string | null
  ): Promise<{ folder: string | null }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/folder/`, { folder: folderId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async setProjectStatus(
    workspaceSlug: string,
    projectId: string,
    status: TProjectStatus
  ): Promise<TProjectStatusResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/status/`, { status })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async dismissReopenedNotice(workspaceSlug: string, projectId: string): Promise<TProjectStatusResponse> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/reopened-notice/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
