/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { ISearchIssueResponse, TIssue } from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type {
  TCreateSubWorkItemProps,
  THandleTemplateChangeProps,
} from "@/components/issues/issue-modal/context/issue-modal-context";
// hooks
import { useCustomProperty } from "@/hooks/store/use-custom-property";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useTemplate } from "@/hooks/store/use-template";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds, templateId } = props;
  const { t } = useTranslation();
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [workItemTemplateId, setWorkItemTemplateId] = useState<string | null>(templateId ?? null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { workItemTemplates, applyWorkItemTemplate } = useTemplate();
  const { fetchIssueValues } = useCustomProperty();
  const { fetchSubIssues } = useIssueDetail();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const findTemplate = (id: string) =>
    Object.values(workItemTemplates)
      .flat()
      .find((template) => template.id === id);

  /** Prefills the form with the selected template's own fields. */
  const handleTemplateChange = async ({ reset, editorRef }: THandleTemplateChangeProps) => {
    const template = workItemTemplateId ? findTemplate(workItemTemplateId) : undefined;
    if (!template) return;
    const data = template.template;
    reset({
      ...DEFAULT_WORK_ITEM_FORM_VALUES,
      project_id: template.project,
      name: data.name,
      description_html: data.description_html,
      priority: data.priority,
      state_id: data.state_id ?? DEFAULT_WORK_ITEM_FORM_VALUES.state_id,
      assignee_ids: data.assignee_ids,
      label_ids: data.label_ids,
      module_ids: data.module_ids.length ? data.module_ids : null,
      estimate_point: data.estimate_point_id,
    });
    editorRef.current?.setEditorValue(data.description_html || "<p></p>");
  };

  /** After creation: adds the template's sub-work items and custom property values. */
  const handleCreateSubWorkItem = async ({ workspaceSlug, projectId, parentId }: TCreateSubWorkItemProps) => {
    const template = workItemTemplateId ? findTemplate(workItemTemplateId) : undefined;
    if (!template || template.project !== projectId) return;
    setIsApplyingTemplate(true);
    try {
      await applyWorkItemTemplate(workspaceSlug, projectId, template.id, parentId);
      // The apply runs server side: reload what it added so cached (e.g. empty) values don't linger
      const { custom_properties: customProperties, sub_issues: subIssues } = template.template;
      await Promise.all([
        Object.keys(customProperties ?? {}).length > 0
          ? fetchIssueValues(workspaceSlug, projectId, parentId).catch(() => undefined)
          : undefined,
        (subIssues ?? []).length > 0
          ? fetchSubIssues(workspaceSlug, projectId, parentId).catch(() => undefined)
          : undefined,
      ]);
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("templates.manage.work_item.apply_error") });
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId,
        setWorkItemTemplateId,
        isApplyingTemplate,
        setIsApplyingTemplate,
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues: {},
        setIssuePropertyValues: () => {},
        issuePropertyValueErrors: {},
        setIssuePropertyValueErrors: () => {},
        getIssueTypeIdOnProjectChange: () => null,
        getActiveAdditionalPropertiesLength: () => 0,
        handlePropertyValuesValidation: () => true,
        handleCreateUpdatePropertyValues: () => Promise.resolve(),
        handleProjectEntitiesFetch: () => Promise.resolve(),
        handleTemplateChange,
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem,
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
