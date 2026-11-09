/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { CloseOutline, WarningCircleFilled } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { cn, renderFormattedDate } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  projectId: string;
  className?: string;
};

/**
 * Says a done project was put back in progress because someone added a work item to it.
 * Stays for everyone until someone dismisses it or changes the project status.
 */
export const ProjectReopenedNotice = observer(function ProjectReopenedNotice(props: Props) {
  const { workspaceSlug, projectId, className } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById, dismissProjectReopenedNotice } = useProject();
  // derived values
  const project = getProjectById(projectId);
  if (!project?.reopened_at || project.archived_at) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex min-w-0 items-center gap-1.5 bg-warning-subtle px-2.5 py-1 text-11 font-medium text-warning-primary",
        className
      )}
    >
      <WarningCircleFilled className="size-3.5 flex-shrink-0" />
      <Tooltip
        label={t("workspace_projects.reopened.notice_on", { date: renderFormattedDate(project.reopened_at) ?? "" })}
      >
        <span className="truncate">{t("workspace_projects.reopened.notice")}</span>
      </Tooltip>
      <button
        type="button"
        aria-label={t("workspace_projects.reopened.dismiss")}
        className="ml-auto grid size-4 flex-shrink-0 place-items-center rounded-sm hover:bg-layer-1"
        onClick={(e) => {
          // Rendered inside the project card, which is a link.
          e.preventDefault();
          e.stopPropagation();
          void dismissProjectReopenedNotice(workspaceSlug, projectId).catch(() => undefined);
        }}
      >
        <CloseOutline className="size-3" />
      </button>
    </div>
  );
});
