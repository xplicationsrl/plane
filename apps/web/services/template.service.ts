/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TProjectTemplate, TWorkItemTemplate, TWorkItemTemplateData } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TWorkItemTemplatePayload = Partial<Pick<TWorkItemTemplate, "name" | "description">> & {
  /** Snapshot this work item (with its sub-work items) instead of sending `template`. */
  issue_id?: string;
  template?: Partial<TWorkItemTemplateData>;
};

export class TemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private workItemBase(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-templates/`;
  }

  private projectBase(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/project-templates/`;
  }

  private unwrap<T>(request: Promise<{ data: T } | undefined>): Promise<T> {
    return request
      .then((res) => res?.data as T)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  listWorkItemTemplates(workspaceSlug: string, projectId: string) {
    return this.unwrap<TWorkItemTemplate[]>(this.get(this.workItemBase(workspaceSlug, projectId)));
  }

  createWorkItemTemplate(workspaceSlug: string, projectId: string, data: TWorkItemTemplatePayload) {
    return this.unwrap<TWorkItemTemplate>(this.post(this.workItemBase(workspaceSlug, projectId), data));
  }

  updateWorkItemTemplate(workspaceSlug: string, projectId: string, templateId: string, data: TWorkItemTemplatePayload) {
    return this.unwrap<TWorkItemTemplate>(
      this.patch(`${this.workItemBase(workspaceSlug, projectId)}${templateId}/`, data)
    );
  }

  deleteWorkItemTemplate(workspaceSlug: string, projectId: string, templateId: string) {
    return this.unwrap<void>(this.delete(`${this.workItemBase(workspaceSlug, projectId)}${templateId}/`));
  }

  applyWorkItemTemplate(workspaceSlug: string, projectId: string, templateId: string, issueId: string) {
    return this.unwrap<{ sub_issues: number }>(
      this.post(`${this.workItemBase(workspaceSlug, projectId)}${templateId}/apply/`, { issue_id: issueId })
    );
  }

  listProjectTemplates(workspaceSlug: string) {
    return this.unwrap<TProjectTemplate[]>(this.get(this.projectBase(workspaceSlug)));
  }

  createProjectTemplate(
    workspaceSlug: string,
    data: { name: string; description?: string; project_id: string; include_work_items: boolean }
  ) {
    return this.unwrap<TProjectTemplate>(this.post(this.projectBase(workspaceSlug), data));
  }

  updateProjectTemplate(workspaceSlug: string, templateId: string, data: Partial<TProjectTemplate>) {
    return this.unwrap<TProjectTemplate>(this.patch(`${this.projectBase(workspaceSlug)}${templateId}/`, data));
  }

  deleteProjectTemplate(workspaceSlug: string, templateId: string) {
    return this.unwrap<void>(this.delete(`${this.projectBase(workspaceSlug)}${templateId}/`));
  }

  applyProjectTemplate(workspaceSlug: string, templateId: string, projectId: string) {
    return this.unwrap<void>(
      this.post(`${this.projectBase(workspaceSlug)}${templateId}/apply/`, { project_id: projectId })
    );
  }
}
