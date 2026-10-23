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

  useEffect(() => {
    if (workspaceSlug && projectId) void fetchWorkItemTemplates(workspaceSlug, projectId).catch(() => undefined);
  }, [workspaceSlug, projectId, fetchWorkItemTemplates]);

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
