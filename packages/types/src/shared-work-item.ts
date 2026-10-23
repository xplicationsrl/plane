/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "./issues";
import type { TStateGroups } from "./state";

/** A work item from another project, shared with the current one. */
export type TSharedWorkItem = {
  id: string;
  name: string;
  sequence_id: number;
  priority: TIssuePriorities;
  target_date: string | null;
  project_id: string;
  project_identifier: string;
  project_name: string;
  state: { name: string; color: string; group: TStateGroups } | null;
  assignee_ids: string[];
  /** Whether the viewer can open it (needs access to its home project). */
  can_open: boolean;
};
