/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TProjectFolder } from "@plane/types";
// services
import { ProjectFolderService } from "@/services/project";
// store
import type { CoreRootStore } from "../root.store";

export interface IProjectFolderStore {
  // observables
  folderMap: Record<string, TProjectFolder>;
  // computed
  currentWorkspaceFolders: TProjectFolder[];
  // computed functions
  getFolderById: (folderId: string | null | undefined) => TProjectFolder | undefined;
  // actions
  fetchFolders: (workspaceSlug: string) => Promise<TProjectFolder[]>;
  createFolder: (workspaceSlug: string, name: string) => Promise<TProjectFolder>;
  renameFolder: (workspaceSlug: string, folderId: string, name: string) => Promise<TProjectFolder>;
  deleteFolder: (workspaceSlug: string, folderId: string) => Promise<void>;
  moveProjectToFolder: (workspaceSlug: string, projectId: string, folderId: string | null) => Promise<void>;
}

export class ProjectFolderStore implements IProjectFolderStore {
  // observables
  folderMap: Record<string, TProjectFolder> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  folderService: ProjectFolderService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      folderMap: observable,
      // computed
      currentWorkspaceFolders: computed,
      // actions
      fetchFolders: action,
      createFolder: action,
      renameFolder: action,
      deleteFolder: action,
      moveProjectToFolder: action,
    });
    this.rootStore = _rootStore;
    this.folderService = new ProjectFolderService();
  }

  /**
   * @description folders of the current workspace, in the order the projects page lists them
   */
  get currentWorkspaceFolders() {
    const workspaceId = this.rootStore.workspaceRoot.currentWorkspace?.id;
    if (!workspaceId) return [];
    return sortBy(
      Object.values(this.folderMap).filter((folder) => folder.workspace === workspaceId),
      [(folder) => folder.sort_order, (folder) => folder.name.toLowerCase()]
    );
  }

  getFolderById = computedFn((folderId: string | null | undefined) =>
    folderId ? this.folderMap[folderId] : undefined
  );

  fetchFolders = async (workspaceSlug: string) => {
    const folders = await this.folderService.list(workspaceSlug);
    runInAction(() => {
      // Replace this workspace's folders so one deleted by someone else drops out.
      const workspaceId = this.rootStore.workspaceRoot.currentWorkspace?.id;
      Object.values(this.folderMap).forEach((folder) => {
        if (folder.workspace === workspaceId) delete this.folderMap[folder.id];
      });
      folders.forEach((folder) => set(this.folderMap, [folder.id], folder));
    });
    return folders;
  };

  createFolder = async (workspaceSlug: string, name: string) => {
    const folder = await this.folderService.create(workspaceSlug, { name });
    runInAction(() => set(this.folderMap, [folder.id], folder));
    return folder;
  };

  renameFolder = async (workspaceSlug: string, folderId: string, name: string) => {
    const folder = await this.folderService.update(workspaceSlug, folderId, { name });
    runInAction(() => set(this.folderMap, [folder.id], folder));
    return folder;
  };

  deleteFolder = async (workspaceSlug: string, folderId: string) => {
    await this.folderService.remove(workspaceSlug, folderId);
    runInAction(() => {
      delete this.folderMap[folderId];
      // The server moved its projects out; mirror that instead of refetching every project.
      const { projectMap } = this.rootStore.projectRoot.project;
      Object.values(projectMap).forEach((project) => {
        if (project.folder === folderId) set(projectMap, [project.id, "folder"], null);
      });
    });
  };

  moveProjectToFolder = async (workspaceSlug: string, projectId: string, folderId: string | null) => {
    const { projectMap } = this.rootStore.projectRoot.project;
    const previousFolderId = projectMap[projectId]?.folder ?? null;
    if (previousFolderId === folderId) return;
    runInAction(() => set(projectMap, [projectId, "folder"], folderId));
    try {
      await this.folderService.moveProject(workspaceSlug, projectId, folderId);
    } catch (error) {
      runInAction(() => set(projectMap, [projectId, "folder"], previousFolderId));
      throw error;
    }
  };
}
