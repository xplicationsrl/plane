/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
// plane imports
import { useLocalStorage } from "@plane/hooks";

/** Key of the "No folder" group in the collapsed list; can't clash with a folder id. */
export const NO_FOLDER_KEY = "no-folder";

/**
 * Which folders on the projects page are folded shut. A personal choice, so it stays in this
 * browser; every caller with the same workspace shares the value.
 */
export const useCollapsedProjectFolders = (workspaceSlug: string | undefined) => {
  const { storedValue, setValue } = useLocalStorage<string[]>(`project_folders_collapsed_${workspaceSlug ?? ""}`, []);
  const collapsed = useMemo(() => new Set(storedValue ?? []), [storedValue]);

  const toggleFolder = useCallback(
    (key: string) => {
      const next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setValue([...next]);
    },
    [collapsed, setValue]
  );

  /** Opens a folder (or "No folder" for `null`), e.g. so a project just moved into it stays in view. */
  const expandFolder = useCallback(
    (folderId: string | null) => {
      const key = folderId ?? NO_FOLDER_KEY;
      if (!collapsed.has(key)) return;
      setValue([...collapsed].filter((item) => item !== key));
    },
    [collapsed, setValue]
  );

  return { collapsed, toggleFolder, expandFolder };
};
