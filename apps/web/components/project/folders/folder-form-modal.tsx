/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
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
import { InputField } from "@makeplane/propel/components/input-field";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TProjectFolder } from "@plane/types";
// hooks
import { useProjectFolder } from "@/hooks/store/use-project-folder";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  /** Rename this folder; leave out to create a new one. */
  folder?: TProjectFolder;
  /** Called with the new folder after a create, e.g. to move a project straight into it. */
  onCreated?: (folder: TProjectFolder) => void;
};

/** Create or rename a project folder. Folders are shared by everyone in the workspace. */
export function ProjectFolderFormModal(props: Props) {
  const { workspaceSlug, isOpen, onClose, folder, onCreated } = props;
  // states
  const [name, setName] = useState(folder?.name ?? "");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { createFolder, renameFolder } = useProjectFolder();

  // Start from the current name each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setName(folder?.name ?? "");
    setError(undefined);
  }, [isOpen, folder?.name]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("workspace_projects.folders.name_required"));
      return;
    }
    if (folder && trimmedName === folder.name) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    try {
      if (folder) await renameFolder(workspaceSlug, folder.id, trimmedName);
      else onCreated?.(await createFolder(workspaceSlug, trimmedName));
      onClose();
    } catch {
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("workspace_projects.folders.save_failed"),
      });
    } finally {
      setIsSubmitting(false);
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
        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>
                  {folder ? t("workspace_projects.folders.rename") : t("workspace_projects.folders.new")}
                </DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <InputField
                id="project-folder-name"
                name="name"
                size="lg"
                orientation="vertical"
                label={t("workspace_projects.folders.name")}
                placeholder={t("workspace_projects.folders.name_placeholder")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(undefined);
                }}
                maxLength={255}
                error={error}
              />
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
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              label={folder ? t("workspace_projects.folders.save") : t("workspace_projects.folders.create")}
              loading={isSubmitting}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
