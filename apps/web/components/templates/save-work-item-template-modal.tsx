/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { Input } from "@makeplane/propel/components/input";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// hooks
import { useTemplate } from "@/hooks/store/use-template";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  issue: TIssue;
};

/** Saves a work item, with its sub-work items and custom property values, as a template. */
export const SaveWorkItemTemplateModal = observer(function SaveWorkItemTemplateModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, issue } = props;
  const { t } = useTranslation();
  const { createWorkItemTemplate } = useTemplate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(issue.name);
      setDescription("");
    }
  }, [isOpen, issue.name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !issue.project_id) return;
    setIsSubmitting(true);
    try {
      await createWorkItemTemplate(workspaceSlug, issue.project_id, {
        name: name.trim(),
        description: description.trim(),
        issue_id: issue.id,
      });
      setToast({
        type: "success",
        title: t("templates.manage.work_item.saved_title"),
        message: t("templates.manage.work_item.saved_message", { name: name.trim() }),
      });
      onClose();
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("templates.manage.save_error") });
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
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{t("templates.manage.work_item.save_title")}</DialogTitle>
              </DialogHeading>
              <DialogDescription>{t("templates.manage.work_item.save_description")}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("name")}</span>
                  <Input
                    size="md"
                    value={name}
                    maxLength={255}
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to type a name
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("common.description")}</span>
                  <Input
                    size="md"
                    value={description}
                    placeholder={t("templates.settings.form.work_item.template.description.placeholder")}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" label={t("common.cancel")} onClick={onClose} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              disabled={!name.trim()}
              loading={isSubmitting}
              label={t("templates.manage.work_item.save_submit")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
