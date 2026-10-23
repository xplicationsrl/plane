/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Switch } from "@makeplane/propel/components/switch";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import {
  AddOutline,
  DeleteOutline,
  EditOutline,
  LinkOutline,
  MoreHorizontalOutline,
  NewTabOutline,
  PagesOutline,
} from "@makeplane/propel/icons";
import { SITES_URL } from "@plane/constants";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIntakeForm } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
// hooks
import { useIntakeForm } from "@/hooks/store/use-intake-form";
// local imports
import { IntakeFormEditorModal } from "./form-editor-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  canEdit: boolean;
};

export const formPublicUrl = (anchor: string) => `${SITES_URL}/forms/${anchor}`;

export const ProjectIntakeFormsSettings = observer(function ProjectIntakeFormsSettings(props: Props) {
  const { workspaceSlug, projectId, canEdit } = props;
  const { t } = useTranslation();
  const { forms, fetchForms, updateForm, deleteForm } = useIntakeForm();
  // states
  const [editor, setEditor] = useState<{ open: boolean; form?: TIntakeForm }>({ open: false });
  const [deleting, setDeleting] = useState<TIntakeForm | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  useEffect(() => {
    if (workspaceSlug && projectId) void fetchForms(workspaceSlug, projectId).catch(() => undefined);
  }, [workspaceSlug, projectId, fetchForms]);

  const projectForms = forms[projectId] ?? [];

  const copyLink = async (form: TIntakeForm) => {
    await copyTextToClipboard(formPublicUrl(form.anchor));
    setToast({ type: "success", title: t("common.link_copied"), message: t("intake_forms.link_copied") });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleteSubmitting(true);
    try {
      await deleteForm(workspaceSlug, projectId, deleting.id);
      setDeleting(null);
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("intake_forms.save_error") });
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-body-sm-regular text-tertiary">{t("intake_forms.description")}</p>
        {canEdit && (
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            icon={<AddOutline className="size-3.5" />}
            label={t("intake_forms.new")}
            onClick={() => setEditor({ open: true })}
          />
        )}
      </div>

      {projectForms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-subtle px-6 py-10 text-center">
          <PagesOutline className="size-6 text-placeholder" />
          <p className="text-body-sm-medium text-secondary">{t("intake_forms.empty_title")}</p>
          <p className="max-w-md text-body-xs-regular text-tertiary">{t("intake_forms.empty_description")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-subtle-1 rounded-lg border border-subtle">
          {projectForms.map((form) => (
            <li key={form.id} className="flex items-center gap-3 px-4 py-3">
              <PagesOutline className="size-4 flex-shrink-0 text-tertiary" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm-medium text-primary">{form.name}</span>
                <span className="truncate text-caption-sm-regular text-tertiary">
                  {t("intake_forms.submissions", { count: form.submission_count })}
                  {!form.is_active && ` · ${t("intake_forms.paused")}`}
                </span>
              </div>
              <Tooltip label={t("common.actions.copy_link")}>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={t("common.actions.copy_link")}
                  icon={<Icon icon={LinkOutline} />}
                  onClick={() => void copyLink(form)}
                />
              </Tooltip>
              <Tooltip label={t("intake_forms.open")}>
                <a
                  href={formPublicUrl(form.anchor)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("intake_forms.open")}
                  className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                >
                  <NewTabOutline className="size-4" />
                </a>
              </Tooltip>
              <Tooltip label={t("intake_forms.accepting")}>
                <span className="flex items-center">
                  <Switch
                    size="sm"
                    checked={form.is_active}
                    disabled={!canEdit}
                    aria-label={t("intake_forms.accepting")}
                    onCheckedChange={(checked) =>
                      void updateForm(workspaceSlug, projectId, form.id, { is_active: checked }).catch(() =>
                        setToast({ type: "error", title: t("toast.error"), message: t("intake_forms.save_error") })
                      )
                    }
                  />
                </span>
              </Tooltip>
              {canEdit && (
                <Menu>
                  <MenuTrigger
                    render={
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={t("aria_labels.common.more_actions")}
                        icon={<Icon icon={MoreHorizontalOutline} />}
                      />
                    }
                  />
                  <MenuContent side="bottom" align="end">
                    <MenuItem
                      icon={<Icon icon={EditOutline} />}
                      label={t("common.edit")}
                      onClick={() => setEditor({ open: true, form })}
                    />
                    <MenuItem
                      icon={<Icon icon={DeleteOutline} />}
                      label={t("common.delete")}
                      onClick={() => setDeleting(form)}
                    />
                  </MenuContent>
                </Menu>
              )}
            </li>
          ))}
        </ul>
      )}

      <IntakeFormEditorModal
        isOpen={editor.open}
        onClose={() => setEditor({ open: false })}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        form={editor.form}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        handleClose={() => setDeleting(null)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleteSubmitting}
        title={t("intake_forms.delete_title")}
        content={t("intake_forms.delete_description", { name: deleting?.name ?? "" })}
      />
    </div>
  );
});
