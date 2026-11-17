/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import { useProjectStatusChange } from "./use-project-status-change";

/**
 * Renders nothing. When closing the last open work item makes the server mark its project done,
 * says so with a toast, since the project then leaves the "Not done" list, and offers Undo.
 */
export const ProjectAutoCompletedToast = observer(function ProjectAutoCompletedToast() {
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { autoCompletedProject, getProjectById, clearAutoCompletedProject } = useProject();
  const { restoreStatus } = useProjectStatusChange();

  useEffect(() => {
    if (!autoCompletedProject) return;
    const { workspaceSlug, projectId, previousStatus } = autoCompletedProject;
    clearAutoCompletedProject();
    const project = getProjectById(projectId);
    if (!project) return;
    setToast({
      type: "success",
      title: t("workspace_projects.status.auto_done", { name: project.name }),
      message: t("workspace_projects.status.auto_done_reason"),
      actionItems: [
        {
          label: t("workspace_projects.status.undo"),
          primary: true,
          onClick: () => restoreStatus(workspaceSlug, projectId, previousStatus),
        },
      ],
    });
  }, [autoCompletedProject, clearAutoCompletedProject, getProjectById, restoreStatus, t]);

  return null;
});
