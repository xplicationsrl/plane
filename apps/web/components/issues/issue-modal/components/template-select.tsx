/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { TemplatesOutline } from "@makeplane/propel/icons";
import { Select } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemTemplate } from "@plane/types";
import type { TWorkItemTemplateFormField } from "@plane/utils";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useTemplate } from "@/hooks/store/use-template";

type Props = {
  workspaceSlug: string;
  projectId: string | null | undefined;
};

const NO_TEMPLATE = "";

/** "Use a template" pill in the create form; hidden when the project has no templates. */
export const WorkItemTemplateSelect = observer(function WorkItemTemplateSelect(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { workItemTemplates, fetchWorkItemTemplates } = useTemplate();
  const { workItemTemplateId, setWorkItemTemplateId } = useIssueModal();

  // A project's entry exists once loaded; template create/update/delete keep it fresh
  const isLoaded = !!projectId && !!workItemTemplates[projectId];
  useEffect(() => {
    if (workspaceSlug && projectId && !isLoaded)
      void fetchWorkItemTemplates(workspaceSlug, projectId).catch(() => undefined);
  }, [workspaceSlug, projectId, isLoaded, fetchWorkItemTemplates]);

  const templates = projectId ? (workItemTemplates[projectId] ?? []) : [];
  if (templates.length === 0) return null;

  const selected = templates.find((template) => template.id === workItemTemplateId) ?? null;
  const none = { id: NO_TEMPLATE, name: t("templates.manage.work_item.none") } as TWorkItemTemplate;

  return (
    <Select<TWorkItemTemplate>
      getValues={() => templates}
      headerItems={selected ? [none] : []}
      value={selected}
      onChange={(id) => setWorkItemTemplateId(id === NO_TEMPLATE ? null : id)}
      placeholder={t("templates.settings.use_template.button.default")}
      showSearch={templates.length > 7}
      pinSelected={false}
      getOptionValue={(template) => template.id}
      getOptionLabel={(template) => template.name}
      getOptionDescription={(template) => template.description || undefined}
    >
      <Select.Trigger<TWorkItemTemplate>
        variant="pill-md"
        prependIcon={() => <TemplatesOutline className="size-3.5" />}
        label={(options) => options[0]?.name ?? t("templates.settings.use_template.button.default")}
      >
        {(options) => (
          <span className="max-w-40 truncate">
            {options[0]?.name ?? t("templates.settings.use_template.button.default")}
          </span>
        )}
      </Select.Trigger>
    </Select>
  );
});

type HintProps = {
  projectId: string | null | undefined;
  /** Fields where the user's own entry was kept over the template's. */
  keptFields: TWorkItemTemplateFormField[];
};

/** One line under the template picker: what the template adds on create, and what of the user's was kept. */
export const WorkItemTemplateHint = observer(function WorkItemTemplateHint(props: HintProps) {
  const { projectId, keptFields } = props;
  const { t } = useTranslation();
  const { workItemTemplates } = useTemplate();
  const { workItemTemplateId } = useIssueModal();

  const template = projectId
    ? (workItemTemplates[projectId] ?? []).find((item) => item.id === workItemTemplateId)
    : undefined;
  if (!template) return null;

  const subItemCount = template.template.sub_issues?.length ?? 0;
  const propertyCount = Object.keys(template.template.custom_properties ?? {}).length;
  const subItems = t("templates.manage.work_item.sub_items", { count: subItemCount });
  const properties = t("templates.manage.work_item.property_values", { count: propertyCount });
  const adds =
    subItemCount && propertyCount
      ? t("templates.manage.work_item.adds_both", { sub_items: subItems, properties })
      : subItemCount
        ? t("templates.manage.work_item.adds_sub_items", { sub_items: subItems })
        : propertyCount
          ? t("templates.manage.work_item.adds_properties", { properties })
          : null;
  const kept = keptFields.length
    ? t("templates.manage.work_item.kept", {
        fields: keptFields.map((field) => t(`templates.manage.work_item.kept_fields.${field}`)).join(", "),
      })
    : null;
  if (!adds && !kept) return null;

  return (
    <p className="text-11 text-tertiary" aria-live="polite">
      {[adds, kept].filter(Boolean).join(" ")}
    </p>
  );
});
