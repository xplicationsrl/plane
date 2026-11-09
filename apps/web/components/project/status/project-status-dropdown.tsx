/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { StateGroupIcon } from "@plane/blocks/icons";
import { setToast } from "@plane/blocks/toast";
import { DEFAULT_PROJECT_STATUS, PROJECT_STATUSES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectStatus } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** Hide the status name and show the round state icon alone. */
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * The project's status, picked the way a work item's state is: backlog, todo, in progress, done
 * or cancelled, with the same round icons. Choosing "Done" is how a project is checked off.
 */
export const ProjectStatusDropdown = observer(function ProjectStatusDropdown(props: Props) {
  const { workspaceSlug, projectId, iconOnly = false, disabled = false, className } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById, updateProjectStatus } = useProject();
  // derived values
  const project = getProjectById(projectId);
  if (!project) return null;
  const currentStatus: TProjectStatus = project.status ?? DEFAULT_PROJECT_STATUS;
  const currentLabel = t(PROJECT_STATUSES.find((status) => status.key === currentStatus)?.i18n_label ?? "");
  const triggerLabel = `${t("workspace_projects.status.label")}: ${currentLabel}`;

  const handleChange = (status: TProjectStatus) => {
    if (status === currentStatus) return;
    updateProjectStatus(workspaceSlug, projectId, status).catch(() =>
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("workspace_projects.status.update_failed"),
      })
    );
  };

  return (
    // Used inside link cards: the menu is portalled, but its clicks still bubble through React to the link.
    <div
      role="presentation"
      data-prevent-progress
      className="flex flex-shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // The card is a link activated by Enter/Space; keep those keys on the dropdown.
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <Menu>
        <Tooltip label={triggerLabel} disabled={!iconOnly}>
          <MenuTrigger
            disabled={disabled}
            render={
              <button
                type="button"
                aria-label={triggerLabel}
                className={cn(
                  "flex h-6 flex-shrink-0 items-center gap-1.5 rounded-sm border border-subtle px-1.5 text-11 font-medium text-secondary transition-colors hover:bg-layer-1",
                  { "w-6 justify-center px-0": iconOnly, "cursor-not-allowed opacity-60": disabled },
                  className
                )}
              />
            }
          >
            <StateGroupIcon stateGroup={currentStatus} />
            {!iconOnly && <span className="truncate">{currentLabel}</span>}
          </MenuTrigger>
        </Tooltip>
        <MenuContent side="bottom" align="start">
          {PROJECT_STATUSES.map((status) => (
            <MenuItem
              key={status.key}
              label={t(status.i18n_label)}
              icon={<StateGroupIcon stateGroup={status.key} />}
              selected={status.key === currentStatus}
              onClick={() => handleChange(status.key)}
            />
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
});
