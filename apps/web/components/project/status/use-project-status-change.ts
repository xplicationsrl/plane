/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { DEFAULT_PROJECT_STATUS, PROJECT_STATUSES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectStatus } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";

/**
 * Changing a project's status usually moves its card to another tab, so the change is confirmed
 * with a toast that names the project and offers Undo.
 */
export const useProjectStatusChange = () => {
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById, updateProjectStatus } = useProject();

  const getStatusLabel = useCallback(
    (status: TProjectStatus) => t(PROJECT_STATUSES.find((item) => item.key === status)?.i18n_label ?? ""),
    [t]
  );

  const showError = useCallback(
    () =>
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("workspace_projects.status.update_failed"),
      }),
    [t]
  );

  /** Puts a project back to the status it had; failures get the usual error toast. */
  const restoreStatus = useCallback(
    (workspaceSlug: string, projectId: string, status: TProjectStatus) => {
      updateProjectStatus(workspaceSlug, projectId, status).catch(showError);
    },
    [updateProjectStatus, showError]
  );

  const changeStatus = useCallback(
    (workspaceSlug: string, projectId: string, status: TProjectStatus) => {
      const project = getProjectById(projectId);
      if (!project) return;
      const previousStatus: TProjectStatus = project.status ?? DEFAULT_PROJECT_STATUS;
      if (status === previousStatus) return;
      updateProjectStatus(workspaceSlug, projectId, status)
        .then(() =>
          setToast({
            type: "success",
            title: t("workspace_projects.status.moved", { name: project.name, status: getStatusLabel(status) }),
            actionItems: [
              {
                label: t("workspace_projects.status.undo"),
                primary: true,
                onClick: () => restoreStatus(workspaceSlug, projectId, previousStatus),
              },
            ],
          })
        )
        .catch(showError);
    },
    [getProjectById, updateProjectStatus, restoreStatus, getStatusLabel, showError, t]
  );

  return { changeStatus, restoreStatus };
};
