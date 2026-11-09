/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { DEFAULT_PROJECT_COMPLETION_FILTER, PROJECT_COMPLETION_FILTER_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectCompletionFilter } from "@plane/types";
import { cn, matchesProjectCompletion } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";

/** Not done / In progress / Done / Cancelled / All switch above the projects list, with a count on each. */
export const ProjectCompletionTabs = observer(function ProjectCompletionTabs() {
  // router
  const { workspaceSlug } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { workspaceProjectIds, getProjectById } = useProject();
  const { currentWorkspaceDisplayFilters, updateDisplayFilters } = useProjectFilter();
  // derived values
  const active = currentWorkspaceDisplayFilters?.completion ?? DEFAULT_PROJECT_COMPLETION_FILTER;
  const counts: Record<TProjectCompletionFilter, number> = {
    not_done: 0,
    in_progress: 0,
    done: 0,
    cancelled: 0,
    all: 0,
  };
  (workspaceProjectIds ?? []).forEach((projectId) => {
    const project = getProjectById(projectId);
    if (!project) return;
    // "In progress" is part of "Not done", so one project can count under both.
    PROJECT_COMPLETION_FILTER_OPTIONS.forEach((option) => {
      if (matchesProjectCompletion(project, option.key)) counts[option.key] += 1;
    });
  });

  return (
    <div
      role="group"
      aria-label={t("workspace_projects.completion.label")}
      className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-subtle px-page-x py-2"
    >
      {PROJECT_COMPLETION_FILTER_OPTIONS.map((option) => {
        const isActive = option.key === active;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isActive}
            className={cn(
              "flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-13 font-medium transition-colors",
              isActive ? "bg-layer-1 text-primary" : "text-tertiary hover:bg-layer-1 hover:text-secondary"
            )}
            onClick={() => {
              if (!workspaceSlug || isActive) return;
              updateDisplayFilters(workspaceSlug.toString(), { completion: option.key });
            }}
          >
            {t(option.i18n_label)}
            <span className="text-11 text-placeholder">{counts[option.key]}</span>
          </button>
        );
      })}
    </div>
  );
});
