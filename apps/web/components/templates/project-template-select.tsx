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
import type { TProjectTemplate } from "@plane/types";
// hooks
import { useTemplate } from "@/hooks/store/use-template";

type Props = {
  workspaceSlug: string;
  value: string | null;
  onChange: (templateId: string | null) => void;
};

const NO_TEMPLATE = "";

/** Template pill in the create project form; hidden while the workspace has no project templates. */
export const ProjectTemplateSelect = observer(function ProjectTemplateSelect(props: Props) {
  const { workspaceSlug, value, onChange } = props;
  const { t } = useTranslation();
  const { projectTemplates, fetchProjectTemplates } = useTemplate();

  useEffect(() => {
    if (workspaceSlug) void fetchProjectTemplates(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, fetchProjectTemplates]);

  const templates = projectTemplates[workspaceSlug] ?? [];
  if (templates.length === 0) return null;

  const selected = templates.find((template) => template.id === value) ?? null;
  const none = { id: NO_TEMPLATE, name: t("templates.manage.project.none") } as TProjectTemplate;

  return (
    <Select<TProjectTemplate>
      getValues={() => templates}
      headerItems={selected ? [none] : []}
      value={selected}
      onChange={(id) => onChange(id === NO_TEMPLATE ? null : id)}
      placeholder={t("templates.settings.use_template.button.default")}
      showSearch={templates.length > 7}
      pinSelected={false}
      getOptionValue={(template) => template.id}
      getOptionLabel={(template) => template.name}
      getOptionDescription={(template) => template.description || undefined}
    >
      <Select.Trigger<TProjectTemplate>
        variant="pill-md"
        prependIcon={() => <TemplatesOutline className="size-3.5" />}
        label={(options) => options[0]?.name ?? t("templates.settings.use_template.button.default")}
      >
        {(options) => (
          <span className="max-w-48 truncate">
            {options[0]?.name ?? t("templates.settings.use_template.button.default")}
          </span>
        )}
      </Select.Trigger>
    </Select>
  );
});
