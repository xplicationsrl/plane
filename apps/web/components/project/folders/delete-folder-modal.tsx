/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TProjectFolder } from "@plane/types";
// hooks
import { useProjectFolder } from "@/hooks/store/use-project-folder";

type Props = {
  workspaceSlug: string;
  folder: TProjectFolder;
  isOpen: boolean;
  onClose: () => void;
};

/** Deleting a folder only removes the grouping: its projects stay. */
export function DeleteProjectFolderModal(props: Props) {
  const { workspaceSlug, folder, isOpen, onClose } = props;
  // states
  const [isDeleting, setIsDeleting] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { deleteFolder } = useProjectFolder();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteFolder(workspaceSlug, folder.id);
      onClose();
    } catch {
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("workspace_projects.folders.delete_failed"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogMain>
          <DialogHeader>
            <DialogHeading>
              <DialogTitle>{t("workspace_projects.folders.delete_title", { name: folder.name })}</DialogTitle>
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            <p className="text-13 text-secondary">{t("workspace_projects.folders.delete_description")}</p>
          </DialogBody>
        </DialogMain>
        <DialogActions>
          <Button
            variant="secondary"
            size="md"
            stretch="auto"
            label={t("workspace_projects.folders.cancel")}
            onClick={onClose}
          />
          <Button
            variant="danger"
            size="md"
            stretch="auto"
            label={t("workspace_projects.folders.delete")}
            onClick={() => void handleDelete()}
            loading={isDeleting}
          />
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
