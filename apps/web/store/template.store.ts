/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TProjectTemplate, TWorkItemTemplate } from "@plane/types";
// services
import type { TWorkItemTemplatePayload } from "@/services/template.service";
import { TemplateService } from "@/services/template.service";

export interface ITemplateStore {
  /** Work item templates per project id. */
  workItemTemplates: Record<string, TWorkItemTemplate[]>;
  /** Project templates per workspace slug. */
  projectTemplates: Record<string, TProjectTemplate[]>;
  getWorkItemTemplate: (projectId: string, templateId: string) => TWorkItemTemplate | undefined;
  fetchWorkItemTemplates: (workspaceSlug: string, projectId: string) => Promise<TWorkItemTemplate[]>;
  createWorkItemTemplate: (
    workspaceSlug: string,
    projectId: string,
    data: TWorkItemTemplatePayload
  ) => Promise<TWorkItemTemplate>;
  updateWorkItemTemplate: (
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: TWorkItemTemplatePayload
  ) => Promise<void>;
  deleteWorkItemTemplate: (workspaceSlug: string, projectId: string, templateId: string) => Promise<void>;
  applyWorkItemTemplate: (
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    issueId: string
  ) => Promise<void>;
  fetchProjectTemplates: (workspaceSlug: string) => Promise<TProjectTemplate[]>;
  createProjectTemplate: (
    workspaceSlug: string,
    data: { name: string; description?: string; project_id: string; include_work_items: boolean }
  ) => Promise<void>;
  updateProjectTemplate: (workspaceSlug: string, templateId: string, data: Partial<TProjectTemplate>) => Promise<void>;
  deleteProjectTemplate: (workspaceSlug: string, templateId: string) => Promise<void>;
  applyProjectTemplate: (workspaceSlug: string, templateId: string, projectId: string) => Promise<void>;
}

export class TemplateStore implements ITemplateStore {
  workItemTemplates: Record<string, TWorkItemTemplate[]> = {};
  projectTemplates: Record<string, TProjectTemplate[]> = {};
  service: TemplateService;

  constructor() {
    makeObservable(this, {
      workItemTemplates: observable,
      projectTemplates: observable,
      fetchWorkItemTemplates: action,
      createWorkItemTemplate: action,
      updateWorkItemTemplate: action,
      deleteWorkItemTemplate: action,
      fetchProjectTemplates: action,
      createProjectTemplate: action,
      updateProjectTemplate: action,
      deleteProjectTemplate: action,
    });
    this.service = new TemplateService();
  }

  getWorkItemTemplate = (projectId: string, templateId: string) =>
    this.workItemTemplates[projectId]?.find((template) => template.id === templateId);

  fetchWorkItemTemplates = async (workspaceSlug: string, projectId: string) => {
    const templates = await this.service.listWorkItemTemplates(workspaceSlug, projectId);
    runInAction(() => set(this.workItemTemplates, [projectId], templates));
    return templates;
  };

  createWorkItemTemplate = async (workspaceSlug: string, projectId: string, data: TWorkItemTemplatePayload) => {
    const template = await this.service.createWorkItemTemplate(workspaceSlug, projectId, data);
    await this.fetchWorkItemTemplates(workspaceSlug, projectId);
    return template;
  };

  updateWorkItemTemplate = async (
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: TWorkItemTemplatePayload
  ) => {
    await this.service.updateWorkItemTemplate(workspaceSlug, projectId, templateId, data);
    await this.fetchWorkItemTemplates(workspaceSlug, projectId);
  };

  deleteWorkItemTemplate = async (workspaceSlug: string, projectId: string, templateId: string) => {
    await this.service.deleteWorkItemTemplate(workspaceSlug, projectId, templateId);
    runInAction(() =>
      set(
        this.workItemTemplates,
        [projectId],
        (this.workItemTemplates[projectId] ?? []).filter((template) => template.id !== templateId)
      )
    );
  };

  applyWorkItemTemplate = async (workspaceSlug: string, projectId: string, templateId: string, issueId: string) => {
    await this.service.applyWorkItemTemplate(workspaceSlug, projectId, templateId, issueId);
  };

  fetchProjectTemplates = async (workspaceSlug: string) => {
    const templates = await this.service.listProjectTemplates(workspaceSlug);
    runInAction(() => set(this.projectTemplates, [workspaceSlug], templates));
    return templates;
  };

  createProjectTemplate = async (
    workspaceSlug: string,
    data: { name: string; description?: string; project_id: string; include_work_items: boolean }
  ) => {
    await this.service.createProjectTemplate(workspaceSlug, data);
    await this.fetchProjectTemplates(workspaceSlug);
  };

  updateProjectTemplate = async (workspaceSlug: string, templateId: string, data: Partial<TProjectTemplate>) => {
    await this.service.updateProjectTemplate(workspaceSlug, templateId, data);
    await this.fetchProjectTemplates(workspaceSlug);
  };

  deleteProjectTemplate = async (workspaceSlug: string, templateId: string) => {
    await this.service.deleteProjectTemplate(workspaceSlug, templateId);
    runInAction(() =>
      set(
        this.projectTemplates,
        [workspaceSlug],
        (this.projectTemplates[workspaceSlug] ?? []).filter((template) => template.id !== templateId)
      )
    );
  };

  applyProjectTemplate = async (workspaceSlug: string, templateId: string, projectId: string) => {
    await this.service.applyProjectTemplate(workspaceSlug, templateId, projectId);
  };
}
