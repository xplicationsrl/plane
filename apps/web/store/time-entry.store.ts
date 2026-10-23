/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TIssueTimeEntry, TIssueTimeSummary, TRunningTimeEntry } from "@plane/types";

/** A timer started here lacks `issue_detail` until the running endpoint is re-read. */
export type TRunningTimer = TIssueTimeEntry & Partial<Pick<TRunningTimeEntry, "issue_detail">>;
// services
import type { TTimeEntryPayload } from "@/services/time-entry.service";
import { TimeEntryService } from "@/services/time-entry.service";

export interface ITimeEntryStore {
  // observables
  summaries: Record<string, TIssueTimeSummary>;
  /** The current user's running timer, wherever it is. */
  running: TRunningTimer | null;
  // actions
  fetchSummary: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueTimeSummary>;
  fetchRunning: (workspaceSlug: string) => Promise<void>;
  logTime: (workspaceSlug: string, projectId: string, issueId: string, data: TTimeEntryPayload) => Promise<void>;
  /** Starts a timer here; resolves with the timer it stopped elsewhere, if any. */
  startTimer: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueTimeEntry | null>;
  stopTimer: (workspaceSlug: string) => Promise<void>;
  updateEntry: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    entryId: string,
    data: TTimeEntryPayload
  ) => Promise<void>;
  deleteEntry: (workspaceSlug: string, projectId: string, issueId: string, entryId: string) => Promise<void>;
}

export class TimeEntryStore implements ITimeEntryStore {
  summaries: Record<string, TIssueTimeSummary> = {};
  running: TRunningTimer | null = null;
  service: TimeEntryService;

  constructor() {
    makeObservable(this, {
      summaries: observable,
      running: observable.ref,
      fetchSummary: action,
      fetchRunning: action,
      logTime: action,
      startTimer: action,
      stopTimer: action,
      updateEntry: action,
      deleteEntry: action,
    });
    this.service = new TimeEntryService();
  }

  fetchSummary = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const summary = await this.service.list(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.summaries, [issueId], summary));
    return summary;
  };

  fetchRunning = async (workspaceSlug: string) => {
    const running = await this.service.getRunning(workspaceSlug);
    runInAction(() => (this.running = running));
  };

  /** Refreshes a summary only if it is on screen (loaded). */
  private refreshIfLoaded = async (workspaceSlug: string, projectId: string, issueId: string) => {
    if (this.summaries[issueId]) await this.fetchSummary(workspaceSlug, projectId, issueId);
  };

  logTime = async (workspaceSlug: string, projectId: string, issueId: string, data: TTimeEntryPayload) => {
    await this.service.log(workspaceSlug, projectId, issueId, data);
    await this.fetchSummary(workspaceSlug, projectId, issueId);
  };

  startTimer = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const { entry, stopped } = await this.service.startTimer(workspaceSlug, projectId, issueId);
    runInAction(() => (this.running = entry));
    await this.fetchSummary(workspaceSlug, projectId, issueId);
    if (stopped && stopped.issue !== issueId) await this.refreshIfLoaded(workspaceSlug, stopped.project, stopped.issue);
    return stopped;
  };

  stopTimer = async (workspaceSlug: string) => {
    const running = this.running;
    if (!running) return;
    await this.service.update(workspaceSlug, running.project, running.issue, running.id, { stop: true });
    runInAction(() => (this.running = null));
    await this.refreshIfLoaded(workspaceSlug, running.project, running.issue);
  };

  updateEntry = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    entryId: string,
    data: TTimeEntryPayload
  ) => {
    await this.service.update(workspaceSlug, projectId, issueId, entryId, data);
    await this.fetchSummary(workspaceSlug, projectId, issueId);
  };

  deleteEntry = async (workspaceSlug: string, projectId: string, issueId: string, entryId: string) => {
    await this.service.remove(workspaceSlug, projectId, issueId, entryId);
    runInAction(() => {
      if (this.running?.id === entryId) this.running = null;
    });
    await this.fetchSummary(workspaceSlug, projectId, issueId);
  };
}
