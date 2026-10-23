/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Checkbox } from "@makeplane/propel/components/checkbox";
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
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Input } from "@makeplane/propel/components/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { DeleteOutline, EditOutline, MoreHorizontalOutline, TemplatesOutline } from "@makeplane/propel/icons";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TProjectTemplate, TWorkItemTemplate } from "@plane/types";
// hooks
import { useTemplate } from "@/hooks/store/use-template";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isProjectAdmin: boolean;
};

type TEditable = { kind: "work_item"; item: TWorkItemTemplate } | { kind: "project"; item: TProjectTemplate };

/** Name + description dialog, shared by rename and "save project as template". */
const TemplateDetailsDialog = observer(function TemplateDetailsDialog(props: {
  isOpen: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  initialName: string;
  initialDescription: string;
  withWorkItemsOption?: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; includeWorkItems: boolean }) => Promise<void>;
}) {
  const { isOpen, title, description, submitLabel, initialName, initialDescription, withWorkItemsOption } = props;
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [details, setDetails] = useState(initialDescription);
  const [includeWorkItems, setIncludeWorkItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setDetails(initialDescription);
    setIncludeWorkItems(false);
  }, [isOpen, initialName, initialDescription]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent size="sm">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setIsSubmitting(true);
            try {
              await props.onSubmit({ name: name.trim(), description: details.trim(), includeWorkItems });
              props.onClose();
            } catch {
              setToast({ type: "error", title: t("toast.error"), message: t("templates.manage.save_error") });
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeading>
              {description && <DialogDescription>{description}</DialogDescription>}
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
                    value={details}
                    placeholder={t("templates.settings.form.work_item.template.description.placeholder")}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </label>
                {withWorkItemsOption && (
                  <Checkbox
                    checked={includeWorkItems}
                    onCheckedChange={(checked) => setIncludeWorkItems(checked === true)}
                    label={t("templates.manage.project.include_work_items")}
                  />
                )}
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" label={t("common.cancel")} onClick={props.onClose} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              disabled={!name.trim()}
              loading={isSubmitting}
              label={submitLabel}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});

function RowActions(props: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
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
        <MenuItem icon={<Icon icon={EditOutline} />} label={t("common.edit")} onClick={props.onEdit} />
        <MenuItem icon={<Icon icon={DeleteOutline} />} label={t("common.delete")} onClick={props.onDelete} />
      </MenuContent>
    </Menu>
  );
}

export const ProjectTemplatesSettings = observer(function ProjectTemplatesSettings(props: Props) {
  const { workspaceSlug, projectId, isProjectAdmin } = props;
  const { t } = useTranslation();
  const {
    workItemTemplates,
    projectTemplates,
    fetchWorkItemTemplates,
    fetchProjectTemplates,
    updateWorkItemTemplate,
    deleteWorkItemTemplate,
    createProjectTemplate,
    updateProjectTemplate,
    deleteProjectTemplate,
  } = useTemplate();
  // states
  const [editing, setEditing] = useState<TEditable | null>(null);
  const [deleting, setDeleting] = useState<TEditable | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const [isSaveProjectOpen, setIsSaveProjectOpen] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    void fetchWorkItemTemplates(workspaceSlug, projectId).catch(() => undefined);
    void fetchProjectTemplates(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, projectId, fetchWorkItemTemplates, fetchProjectTemplates]);

  const itemTemplates = workItemTemplates[projectId] ?? [];
  const wsTemplates = projectTemplates[workspaceSlug] ?? [];

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleteSubmitting(true);
    try {
      if (deleting.kind === "work_item") await deleteWorkItemTemplate(workspaceSlug, projectId, deleting.item.id);
      else await deleteProjectTemplate(workspaceSlug, deleting.item.id);
      setDeleting(null);
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("templates.manage.delete_error") });
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  const summaryText = (template: TProjectTemplate) =>
    t("templates.manage.project.summary", {
      states: template.summary.states,
      properties: template.summary.custom_properties,
      templates: template.summary.work_item_templates,
      items: template.summary.work_items,
    });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-body-md-medium text-primary">{t("templates.settings.options.work_item.label")}</h3>
          <p className="text-body-sm-regular text-tertiary">{t("templates.manage.work_item.description")}</p>
        </div>
        {itemTemplates.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-subtle px-4 py-6">
            <TemplatesOutline className="size-5 flex-shrink-0 text-placeholder" />
            <p className="text-body-xs-regular text-tertiary">{t("templates.manage.work_item.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-subtle-1 rounded-lg border border-subtle">
            {itemTemplates.map((template) => (
              <li key={template.id} className="flex items-center gap-3 px-4 py-3">
                <TemplatesOutline className="size-4 flex-shrink-0 text-tertiary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm-medium text-primary">{template.name}</span>
                  <span className="truncate text-caption-sm-regular text-tertiary">
                    {template.description ||
                      t("templates.manage.work_item.sub_items", { count: template.template.sub_issues.length })}
                  </span>
                </div>
                <RowActions
                  onEdit={() => setEditing({ kind: "work_item", item: template })}
                  onDelete={() => setDeleting({ kind: "work_item", item: template })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-body-md-medium text-primary">{t("templates.settings.options.project.label")}</h3>
            <p className="text-body-sm-regular text-tertiary">{t("templates.manage.project.description")}</p>
          </div>
          {isProjectAdmin && (
            <Button
              variant="secondary"
              size="md"
              stretch="auto"
              label={t("templates.manage.project.save_action")}
              onClick={() => setIsSaveProjectOpen(true)}
            />
          )}
        </div>
        {wsTemplates.length > 0 && (
          <ul className="divide-y divide-subtle-1 rounded-lg border border-subtle">
            {wsTemplates.map((template) => (
              <li key={template.id} className="flex items-center gap-3 px-4 py-3">
                <TemplatesOutline className="size-4 flex-shrink-0 text-tertiary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm-medium text-primary">{template.name}</span>
                  <span className="truncate text-caption-sm-regular text-tertiary">
                    {template.description || summaryText(template)}
                  </span>
                </div>
                <RowActions
                  onEdit={() => setEditing({ kind: "project", item: template })}
                  onDelete={() => setDeleting({ kind: "project", item: template })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <TemplateDetailsDialog
        isOpen={!!editing}
        title={t("templates.manage.edit_title")}
        submitLabel={t("save")}
        initialName={editing?.item.name ?? ""}
        initialDescription={editing?.item.description ?? ""}
        onClose={() => setEditing(null)}
        onSubmit={async ({ name, description }) => {
          if (!editing) return;
          if (editing.kind === "work_item")
            await updateWorkItemTemplate(workspaceSlug, projectId, editing.item.id, { name, description });
          else await updateProjectTemplate(workspaceSlug, editing.item.id, { name, description });
        }}
      />
      <TemplateDetailsDialog
        isOpen={isSaveProjectOpen}
        title={t("templates.manage.project.save_title")}
        description={t("templates.manage.project.save_description")}
        submitLabel={t("templates.manage.project.save_submit")}
        initialName=""
        initialDescription=""
        withWorkItemsOption
        onClose={() => setIsSaveProjectOpen(false)}
        onSubmit={async ({ name, description, includeWorkItems }) => {
          await createProjectTemplate(workspaceSlug, {
            name,
            description,
            project_id: projectId,
            include_work_items: includeWorkItems,
          });
          setToast({
            type: "success",
            title: t("templates.manage.project.saved_title"),
            message: t("templates.manage.project.saved_message", { name }),
          });
        }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        handleClose={() => setDeleting(null)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleteSubmitting}
        title={t("templates.manage.delete_title")}
        content={t("templates.manage.delete_description", { name: deleting?.item.name ?? "" })}
      />
    </div>
  );
});
