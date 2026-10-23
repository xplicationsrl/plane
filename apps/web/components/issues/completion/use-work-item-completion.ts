/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";

/**
 * Resolves the states a one-click "mark complete" toggle moves a work item between:
 * the project's first Completed-group state, and back to its default state on reopen.
 */
export const useWorkItemCompletion = (projectId: string | null | undefined) => {
  const { getProjectStates, getProjectDefaultStateId, getStateById } = useProjectState();
  const states = sortBy(getProjectStates(projectId) ?? [], "sequence");

  const completedStateId = states.find((state) => state.group === "completed")?.id;
  const defaultStateId = getProjectDefaultStateId(projectId);
  const reopenStateId =
    defaultStateId && getStateById(defaultStateId)?.group !== "completed"
      ? defaultStateId
      : states.find((state) => state.group === "unstarted" || state.group === "backlog")?.id;

  const isCompleted = (stateId: string | null | undefined) => getStateById(stateId)?.group === "completed";

  /** The state the toggle should move to, or undefined when the project lacks one. */
  const getToggledStateId = (stateId: string | null | undefined) =>
    isCompleted(stateId) ? reopenStateId : completedStateId;

  return { isCompleted, getToggledStateId };
};
