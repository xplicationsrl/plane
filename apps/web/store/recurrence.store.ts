/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TIssueRecurrence, TIssueRecurrencePayload, TRecurrenceContinuation } from "@plane/types";
// services
import { RecurrenceService } from "@/services/recurrence.service";
// store
import type { RootStore } from "@/store/root.store";

/** The spawn runs in the worker after the completion is saved, so its result is polled for. */
const FOLLOW_UP_DELAYS_MS = [0, 1000, 2000, 3000, 5000];
/** A continuation older than this was made by an earlier completion, not the one just saved. */
const FRESH_CONTINUATION_MS = 2 * 60 * 1000;

export type TRecurrenceContinuationEvent = {
  workspaceSlug: string;
  issueId: string;
  next: TRecurrenceContinuation;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /** The last time a completion created the next occurrence; the top bar turns it into a toast. */
  lastContinuation: TRecurrenceContinuationEvent | null;
  /** After a work item is completed: wait for its next occurrence and show it in the lists. */
  followUpCompletion: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
}

export class RecurrenceStore implements IRecurrenceStore {
  recurrences: Record<string, TIssueRecurrence | null> = {};
  lastContinuation: TRecurrenceContinuationEvent | null = null;
  service: RecurrenceService;
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    makeObservable(this, {
      recurrences: observable,
      lastContinuation: observable.ref,
      fetchRecurrence: action,
      saveRecurrence: action,
      removeRecurrence: action,
      followUpCompletion: action,
    });
    this.service = new RecurrenceService();
    this.rootStore = rootStore;
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

  followUpCompletion = async (workspaceSlug: string, projectId: string, issueId: string) => {
    for (const delay of FOLLOW_UP_DELAYS_MS) {
      // Polling: each try waits for the previous one
      // oxlint-disable-next-line no-await-in-loop
      if (delay) await wait(delay);
      let recurrence: TIssueRecurrence | null;
      try {
        // oxlint-disable-next-line no-await-in-loop
        recurrence = await this.service.retrieve(workspaceSlug, projectId, issueId);
      } catch {
        return;
      }
      runInAction(() => set(this.recurrences, [issueId], recurrence));
      const next = recurrence?.continued_in;
      if (next) {
        if (Date.now() - new Date(next.continued_at).getTime() < FRESH_CONTINUATION_MS)
          this.announceContinuation(workspaceSlug, projectId, issueId, next);
        return;
      }
      // Doesn't repeat, or this completion ended the rule
      if (!recurrence?.is_active) return;
    }
  };

  private announceContinuation = (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    next: TRecurrenceContinuation
  ) => {
    runInAction(() => {
      this.lastContinuation = { workspaceSlug, issueId, next };
    });
    // The copy joins the project lists and, for a sub-work item, its parent's list
    const issueRoot = this.rootStore.issue;
    // Only the open project's list: refetching it for another project would swap in that project's items
    if (this.rootStore.router.projectId === next.project_id)
      void issueRoot.projectIssues
        .fetchIssuesWithExistingPagination(workspaceSlug, next.project_id, "mutation")
        .catch(() => undefined);
    const parentId = issueRoot.issues.getIssueById(issueId)?.parent_id;
    if (parentId) void issueRoot.issueDetail.fetchSubIssues(workspaceSlug, projectId, parentId).catch(() => undefined);
  };
}
