/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TIssueRecurrence, TIssueRecurrencePayload } from "@plane/types";
// services
import { RecurrenceService } from "@/services/recurrence.service";

export interface IRecurrenceStore {
  /** Rule per work item id; null when the work item doesn't repeat. */
  recurrences: Record<string, TIssueRecurrence | null>;
  fetchRecurrence: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  saveRecurrence: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueRecurrencePayload
  ) => Promise<void>;
  removeRecurrence: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
}

export class RecurrenceStore implements IRecurrenceStore {
  recurrences: Record<string, TIssueRecurrence | null> = {};
  service: RecurrenceService;

  constructor() {
    makeObservable(this, {
      recurrences: observable,
      fetchRecurrence: action,
      saveRecurrence: action,
      removeRecurrence: action,
    });
    this.service = new RecurrenceService();
  }

  fetchRecurrence = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const recurrence = await this.service.retrieve(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.recurrences, [issueId], recurrence));
  };

  saveRecurrence = async (workspaceSlug: string, projectId: string, issueId: string, data: TIssueRecurrencePayload) => {
    const recurrence = await this.service.save(workspaceSlug, projectId, issueId, data);
    runInAction(() => set(this.recurrences, [issueId], recurrence));
  };

  removeRecurrence = async (workspaceSlug: string, projectId: string, issueId: string) => {
    await this.service.remove(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.recurrences, [issueId], null));
  };
}
