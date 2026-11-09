/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { FolderOutline, FolderXOutline, AddOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectFolder } from "@/hooks/store/use-project-folder";

type Props = {
  projectId: string;
  /** Move the project; `null` takes it out of its folder. */
  onMove: (folderId: string | null) => void;
  /** Open the "new folder" dialog. The card owns it, since a dialog can't live inside the card's link. */
  onCreateFolder: () => void;
};

/** Folder button on a project card: pick a folder, take the project out of one, or start a new folder. */
export const MoveProjectToFolderMenu = observer(function MoveProjectToFolderMenu(props: Props) {
  const { projectId, onMove, onCreateFolder } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { currentWorkspaceFolders } = useProjectFolder();
  // derived values
  const currentFolderId = getProjectById(projectId)?.folder ?? null;
  const label = t("workspace_projects.folders.move_to");

  return (
    // The card is a link: the menu is portalled, but its clicks still bubble through React to it.
    <div
      role="presentation"
      className="flex flex-shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <Menu>
        <Tooltip label={label}>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label={label}
                className="flex h-6 w-6 items-center justify-center rounded-sm bg-white/10"
              />
            }
          >
            <FolderOutline className="h-3 w-3 text-on-color" />
          </MenuTrigger>
        </Tooltip>
        <MenuContent side="bottom" align="end">
          {currentWorkspaceFolders.map((folder) => (
            <MenuItem
              key={folder.id}
              label={folder.name}
              icon={<FolderOutline className="size-3.5" />}
              selected={folder.id === currentFolderId}
              onClick={() => onMove(folder.id)}
            />
          ))}
          <MenuItem
            label={t("workspace_projects.folders.no_folder")}
            icon={<FolderXOutline className="size-3.5" />}
            selected={currentFolderId === null}
            onClick={() => onMove(null)}
          />
          <MenuSeparator />
          <MenuItem
            label={t("workspace_projects.folders.new")}
            icon={<AddOutline className="size-3.5" />}
            onClick={onCreateFolder}
          />
        </MenuContent>
      </Menu>
    </div>
  );
});
