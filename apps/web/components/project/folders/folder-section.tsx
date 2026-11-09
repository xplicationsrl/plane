/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import {
  ChevronDownOutline,
  ChevronRightOutline,
  DeleteOutline,
  EditOutline,
  FolderOpenOutline,
  FolderOutline,
  MoreHorizontalOutline,
} from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import type { TProjectFolder } from "@plane/types";
// local imports
import { DeleteProjectFolderModal } from "./delete-folder-modal";
import { ProjectFolderFormModal } from "./folder-form-modal";

type Props = {
  workspaceSlug: string;
  /** Leave out for the "No folder" group, which can't be renamed or deleted. */
  folder?: TProjectFolder;
  /** Projects shown in the group with the current search and filters. */
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

/** One collapsible group on the projects page: a folder, or the projects that sit in none. */
export function ProjectFolderSection(props: Props) {
  const { workspaceSlug, folder, count, isCollapsed, onToggle, children } = props;
  // states
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // derived values
  const name = folder?.name ?? t("workspace_projects.folders.no_folder");
  const FolderIcon = isCollapsed ? FolderOutline : FolderOpenOutline;
  const ChevronIcon = isCollapsed ? ChevronRightOutline : ChevronDownOutline;

  return (
    <section aria-label={name} className="flex flex-col gap-4">
      {folder && (
        <>
          <ProjectFolderFormModal
            workspaceSlug={workspaceSlug}
            folder={folder}
            isOpen={isRenameOpen}
            onClose={() => setIsRenameOpen(false)}
          />
          <DeleteProjectFolderModal
            workspaceSlug={workspaceSlug}
            folder={folder}
            isOpen={isDeleteOpen}
            onClose={() => setIsDeleteOpen(false)}
          />
        </>
      )}
      <div className="flex items-center gap-2 border-b border-subtle pb-2">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          className="flex min-w-0 items-center gap-2 rounded-sm text-14 font-semibold text-primary hover:text-secondary"
          onClick={onToggle}
        >
          <ChevronIcon className="size-4 flex-shrink-0 text-tertiary" />
          {folder && <FolderIcon className="size-4 flex-shrink-0 text-tertiary" />}
          <span className="truncate">{name}</span>
          <span className="font-normal flex-shrink-0 text-13 text-placeholder">{count}</span>
        </button>
        {folder && (
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("workspace_projects.folders.actions")}
                  className="ml-auto grid size-6 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-secondary"
                />
              }
            >
              <MoreHorizontalOutline className="size-4" />
            </MenuTrigger>
            <MenuContent side="bottom" align="end">
              <MenuItem
                label={t("workspace_projects.folders.rename")}
                icon={<EditOutline className="size-3.5" />}
                onClick={() => setIsRenameOpen(true)}
              />
              <MenuItem
                variant="danger"
                label={t("workspace_projects.folders.delete")}
                icon={<DeleteOutline className="size-3.5" />}
                onClick={() => setIsDeleteOpen(true)}
              />
            </MenuContent>
          </Menu>
        )}
      </div>
      {!isCollapsed &&
        (count > 0 ? children : <p className="text-13 text-placeholder">{t("workspace_projects.folders.empty")}</p>)}
    </section>
  );
}
