/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TIntakeForm } from "@plane/types";
// services
import type { TIntakeFormPayload } from "@/services/intake-form.service";
import { IntakeFormService } from "@/services/intake-form.service";

export interface IIntakeFormStore {
  /** Forms per project id. */
  forms: Record<string, TIntakeForm[]>;
  fetchForms: (workspaceSlug: string, projectId: string) => Promise<TIntakeForm[]>;
  createForm: (workspaceSlug: string, projectId: string, data: TIntakeFormPayload) => Promise<TIntakeForm>;
  updateForm: (workspaceSlug: string, projectId: string, formId: string, data: TIntakeFormPayload) => Promise<void>;
  deleteForm: (workspaceSlug: string, projectId: string, formId: string) => Promise<void>;
}

export class IntakeFormStore implements IIntakeFormStore {
  forms: Record<string, TIntakeForm[]> = {};
  service: IntakeFormService;

  constructor() {
    makeObservable(this, {
      forms: observable,
      fetchForms: action,
      createForm: action,
      updateForm: action,
      deleteForm: action,
    });
    this.service = new IntakeFormService();
  }

  fetchForms = async (workspaceSlug: string, projectId: string) => {
    const forms = await this.service.list(workspaceSlug, projectId);
    runInAction(() => set(this.forms, [projectId], forms));
    return forms;
  };

  createForm = async (workspaceSlug: string, projectId: string, data: TIntakeFormPayload) => {
    const form = await this.service.create(workspaceSlug, projectId, data);
    runInAction(() => set(this.forms, [projectId], [form, ...(this.forms[projectId] ?? [])]));
    return form;
  };

  updateForm = async (workspaceSlug: string, projectId: string, formId: string, data: TIntakeFormPayload) => {
    const form = await this.service.update(workspaceSlug, projectId, formId, data);
    runInAction(() =>
      set(
        this.forms,
        [projectId],
        (this.forms[projectId] ?? []).map((item) => (item.id === formId ? form : item))
      )
    );
  };

  deleteForm = async (workspaceSlug: string, projectId: string, formId: string) => {
    await this.service.remove(workspaceSlug, projectId, formId);
    runInAction(() =>
      set(
        this.forms,
        [projectId],
        (this.forms[projectId] ?? []).filter((item) => item.id !== formId)
      )
    );
  };
}
