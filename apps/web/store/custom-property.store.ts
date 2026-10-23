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
  fetchProjectProperties: (workspaceSlug: string, projectId: string) => Promise<TCustomProperty[]>;
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
  // services
  service: CustomPropertyService;

  constructor() {
    makeObservable(this, {
      propertyMap: observable,
      fetchedProjectIds: observable,
      issueValues: observable,
      fetchProjectProperties: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      fetchIssueValues: action,
      updateIssueValue: action,
    });
    this.service = new CustomPropertyService();
  }

  getProjectProperties = computedFn((projectId: string | null | undefined, includeInactive = false) => {
    if (!projectId) return [];
    const properties = Object.values(this.propertyMap).filter(
      (property) => property.project === projectId && (includeInactive || property.is_active)
    );
    return sortBy(properties, ["sort_order", "created_at"]);
  });

  getPropertyById = (propertyId: string) => this.propertyMap[propertyId];

  getIssueValues = (issueId: string) => this.issueValues[issueId];

  fetchProjectProperties = async (workspaceSlug: string, projectId: string) => {
    const properties = await this.service.list(workspaceSlug, projectId);
    runInAction(() => {
      Object.values(this.propertyMap)
        .filter((property) => property.project === projectId)
        .forEach((property) => delete this.propertyMap[property.id]);
      properties.forEach((property) => set(this.propertyMap, [property.id], property));
      this.fetchedProjectIds[projectId] = true;
    });
    return properties;
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

  /** Optimistic: the value shows immediately and rolls back if the server rejects it. */
  updateIssueValue = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string,
    value: TCustomPropertyValue
  ) => {
    const previous = { ...this.issueValues[issueId] };
    runInAction(() => {
      const next = { ...previous };
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[propertyId];
      else next[propertyId] = value;
      set(this.issueValues, [issueId], next);
    });
    try {
      const values = await this.service.updateIssueValues(workspaceSlug, projectId, issueId, { [propertyId]: value });
      runInAction(() => set(this.issueValues, [issueId], values));
    } catch (error) {
      runInAction(() => set(this.issueValues, [issueId], previous));
      throw error;
    }
  };
}
