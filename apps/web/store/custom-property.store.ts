/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TCustomProperty, TCustomPropertyValue, TIssueCustomPropertyValues } from "@plane/types";
// services
import { CustomPropertyService } from "@/services/custom-property.service";

/** A cleared value: the store keeps no key for it. */
const isEmptyValue = (value: TCustomPropertyValue | undefined) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

export interface ICustomPropertyStore {
  // observables
  propertyMap: Record<string, TCustomProperty>;
  fetchedProjectIds: Record<string, boolean>;
  issueValues: Record<string, TIssueCustomPropertyValues>;
  // helpers
  getProjectProperties: (projectId: string | null | undefined, includeInactive?: boolean) => TCustomProperty[];
  getPropertyById: (propertyId: string) => TCustomProperty | undefined;
  getIssueValues: (issueId: string) => TIssueCustomPropertyValues | undefined;
  // actions
  /** Always hits the API; use where fresh data is required (e.g. settings). */
  fetchProjectProperties: (workspaceSlug: string, projectId: string) => Promise<TCustomProperty[]>;
  /** Loads a project's properties once; concurrent callers share the in-flight request. */
  ensureProjectProperties: (workspaceSlug: string, projectId: string) => Promise<TCustomProperty[]>;
  createProperty: (
    workspaceSlug: string,
    projectId: string,
    data: Partial<TCustomProperty>
  ) => Promise<TCustomProperty>;
  updateProperty: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TCustomProperty>
  ) => Promise<TCustomProperty>;
  deleteProperty: (workspaceSlug: string, projectId: string, propertyId: string) => Promise<void>;
  fetchIssueValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueCustomPropertyValues>;
  /** Loads values for list rows, skipping work items already loaded. */
  fetchBulkIssueValues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  updateIssueValue: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string,
    value: TCustomPropertyValue
  ) => Promise<void>;
}

export class CustomPropertyStore implements ICustomPropertyStore {
  propertyMap: Record<string, TCustomProperty> = {};
  fetchedProjectIds: Record<string, boolean> = {};
  issueValues: Record<string, TIssueCustomPropertyValues> = {};
  // in-flight requests, keyed by project id / work item id (not observable)
  private pendingProjectFetches = new Map<string, Promise<TCustomProperty[]>>();
  private pendingIssueValueIds = new Map<string, Promise<void>>();
  // services
  service: CustomPropertyService;

  constructor() {
    makeObservable(this, {
      propertyMap: observable,
      fetchedProjectIds: observable,
      issueValues: observable,
      fetchProjectProperties: action,
      ensureProjectProperties: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      fetchIssueValues: action,
      fetchBulkIssueValues: action,
      updateIssueValue: action,
    });
    this.service = new CustomPropertyService();
  }

  // computedFn throws unless every call passes the same number of arguments, so the
  // optional flag is always filled in before reaching it
  private computeProjectProperties = computedFn(
    (projectId: string | null | undefined, includeInactive: boolean): TCustomProperty[] => {
      if (!projectId) return [];
      const properties = Object.values(this.propertyMap).filter(
        (property) => property.project === projectId && (includeInactive || property.is_active)
      );
      return sortBy(properties, ["sort_order", "created_at"]);
    }
  );

  getProjectProperties = (projectId: string | null | undefined, includeInactive = false) =>
    this.computeProjectProperties(projectId, includeInactive);

  getPropertyById = (propertyId: string) => this.propertyMap[propertyId];

  getIssueValues = (issueId: string) => this.issueValues[issueId];

  fetchProjectProperties = async (workspaceSlug: string, projectId: string) => {
    const request = this.service.list(workspaceSlug, projectId).then((properties) => {
      runInAction(() => {
        Object.values(this.propertyMap)
          .filter((property) => property.project === projectId)
          .forEach((property) => delete this.propertyMap[property.id]);
        properties.forEach((property) => set(this.propertyMap, [property.id], property));
        this.fetchedProjectIds[projectId] = true;
      });
      return properties;
    });
    this.pendingProjectFetches.set(projectId, request);
    try {
      return await request;
    } finally {
      if (this.pendingProjectFetches.get(projectId) === request) this.pendingProjectFetches.delete(projectId);
    }
  };

  ensureProjectProperties = (workspaceSlug: string, projectId: string) => {
    if (this.fetchedProjectIds[projectId]) return Promise.resolve(this.getProjectProperties(projectId, true));
    return this.pendingProjectFetches.get(projectId) ?? this.fetchProjectProperties(workspaceSlug, projectId);
  };

  createProperty = async (workspaceSlug: string, projectId: string, data: Partial<TCustomProperty>) => {
    const property = await this.service.create(workspaceSlug, projectId, data);
    runInAction(() => set(this.propertyMap, [property.id], property));
    return property;
  };

  updateProperty = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TCustomProperty>
  ) => {
    const property = await this.service.update(workspaceSlug, projectId, propertyId, data);
    runInAction(() => set(this.propertyMap, [property.id], property));
    return property;
  };

  deleteProperty = async (workspaceSlug: string, projectId: string, propertyId: string) => {
    await this.service.remove(workspaceSlug, projectId, propertyId);
    runInAction(() => {
      delete this.propertyMap[propertyId];
      Object.values(this.issueValues).forEach((values) => delete values[propertyId]);
    });
  };

  fetchIssueValues = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const values = await this.service.getIssueValues(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.issueValues, [issueId], values));
    return values;
  };

  fetchBulkIssueValues = async (workspaceSlug: string, projectId: string, issueIds: string[]) => {
    // ids already loaded or being loaded by a concurrent call are not requested again
    const pending = new Set<Promise<void>>();
    const missing: string[] = [];
    new Set(issueIds).forEach((id) => {
      if (this.issueValues[id]) return;
      const inFlight = this.pendingIssueValueIds.get(id);
      if (inFlight) pending.add(inFlight);
      else missing.push(id);
    });
    // Ids travel in the query string; 100 per request keeps the URL well under proxy limits
    const CHUNK_SIZE = 100;
    for (let start = 0; start < missing.length; start += CHUNK_SIZE) {
      const chunk = missing.slice(start, start + CHUNK_SIZE);
      const request = this.service
        .getBulkIssueValues(workspaceSlug, projectId, chunk)
        .then((values) =>
          runInAction(() =>
            Object.entries(values).forEach(([issueId, issueValues]) => set(this.issueValues, [issueId], issueValues))
          )
        );
      const tracked = request.finally(() =>
        chunk.forEach((id) => {
          if (this.pendingIssueValueIds.get(id) === tracked) this.pendingIssueValueIds.delete(id);
        })
      );
      chunk.forEach((id) => this.pendingIssueValueIds.set(id, tracked));
      pending.add(tracked);
    }
    await Promise.all(pending);
  };

  /** Optimistic: the value shows immediately and rolls back if the server rejects it. */
  updateIssueValue = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string,
    value: TCustomPropertyValue
  ) => {
    // Only the edited key is snapshotted, so a rollback doesn't undo concurrent edits of other keys.
    // Work items whose values were never loaded stay unloaded; the server response fills them in.
    const isLoaded = !!this.issueValues[issueId];
    const previous = isLoaded ? this.issueValues[issueId][propertyId] : undefined;
    const apply = (next: TCustomPropertyValue | undefined) =>
      runInAction(() => {
        const current = this.issueValues[issueId];
        if (!current) return;
        const updated = { ...current };
        if (isEmptyValue(next)) delete updated[propertyId];
        else updated[propertyId] = next as TCustomPropertyValue;
        set(this.issueValues, [issueId], updated);
      });
    apply(value);
    try {
      const values = await this.service.updateIssueValues(workspaceSlug, projectId, issueId, { [propertyId]: value });
      runInAction(() => set(this.issueValues, [issueId], values));
    } catch (error) {
      apply(previous);
      throw error;
    }
  };
}
