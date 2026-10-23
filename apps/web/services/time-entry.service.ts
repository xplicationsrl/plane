/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueTimeEntry, TIssueTimeSummary, TRunningTimeEntry } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TTimeEntryPayload = Partial<Pick<TIssueTimeEntry, "duration_seconds" | "logged_on" | "description">>;

export class TimeEntryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-entries`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueTimeSummary> {
    return this.get(`${this.base(workspaceSlug, projectId, issueId)}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async log(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TTimeEntryPayload
  ): Promise<TIssueTimeEntry> {
    return this.post(`${this.base(workspaceSlug, projectId, issueId)}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async startTimer(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<{ entry: TIssueTimeEntry; stopped: TIssueTimeEntry | null }> {
    return this.post(`${this.base(workspaceSlug, projectId, issueId)}/`, { timer: "start" })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    entryId: string,
    data: TTimeEntryPayload | { stop: true }
  ): Promise<TIssueTimeEntry> {
    return this.patch(`${this.base(workspaceSlug, projectId, issueId)}/${entryId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string, entryId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId, issueId)}/${entryId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getRunning(workspaceSlug: string): Promise<TRunningTimeEntry | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/time-entries/running/`)
      .then((res) => res?.data ?? null)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
