/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TSharedWorkItem } from "@plane/types";
// services
import { SharedWorkItemService } from "@/services/shared-work-item.service";

export interface ISharedWorkItemStore {
  /** Other projects each work item is shared with. */
  linkedProjectIds: Record<string, string[]>;
  /** Work items shared into each project. */
  sharedWorkItems: Record<string, TSharedWorkItem[]>;
  fetchLinkedProjects: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  setLinkedProjects: (workspaceSlug: string, projectId: string, issueId: string, projectIds: string[]) => Promise<void>;
  fetchSharedWorkItems: (workspaceSlug: string, projectId: string) => Promise<void>;
}

export class SharedWorkItemStore implements ISharedWorkItemStore {
  linkedProjectIds: Record<string, string[]> = {};
  sharedWorkItems: Record<string, TSharedWorkItem[]> = {};
  service: SharedWorkItemService;

  constructor() {
    makeObservable(this, {
      linkedProjectIds: observable,
      sharedWorkItems: observable,
      fetchLinkedProjects: action,
      setLinkedProjects: action,
      fetchSharedWorkItems: action,
    });
    this.service = new SharedWorkItemService();
  }

  fetchLinkedProjects = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const ids = await this.service.getLinkedProjects(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.linkedProjectIds, [issueId], ids));
  };

  /** Optimistic: the chips update immediately and roll back if the server refuses. */
  setLinkedProjects = async (workspaceSlug: string, projectId: string, issueId: string, projectIds: string[]) => {
    const previous = this.linkedProjectIds[issueId] ?? [];
    runInAction(() => set(this.linkedProjectIds, [issueId], projectIds));
    try {
      const ids = await this.service.setLinkedProjects(workspaceSlug, projectId, issueId, projectIds);
      runInAction(() => set(this.linkedProjectIds, [issueId], ids));
      // Projects gaining or losing this item have stale "shared into" lists: refresh the cached ones
      const changed = [...previous.filter((id) => !ids.includes(id)), ...ids.filter((id) => !previous.includes(id))];
      changed
        .filter((id) => this.sharedWorkItems[id])
        .forEach((id) => void this.fetchSharedWorkItems(workspaceSlug, id).catch(() => undefined));
    } catch (error) {
      runInAction(() => set(this.linkedProjectIds, [issueId], previous));
      throw error;
    }
  };

  fetchSharedWorkItems = async (workspaceSlug: string, projectId: string) => {
    const items = await this.service.getSharedWorkItems(workspaceSlug, projectId);
    runInAction(() => set(this.sharedWorkItems, [projectId], items));
  };
}
