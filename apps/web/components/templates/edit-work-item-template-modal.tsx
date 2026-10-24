/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogCloseGroup,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Input } from "@makeplane/propel/components/input";
import { AddOutline, ArrowDownOutline, ArrowUpOutline, CloseOutline } from "@makeplane/propel/icons";
import { PrioritySelect } from "@plane/blocks/property-select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIssuePriorities, TWorkItemTemplate, TWorkItemTemplateSubItem } from "@plane/types";
// hooks
import { useTemplate } from "@/hooks/store/use-template";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  template: TWorkItemTemplate | null;
};

type TDraftSubItem = TWorkItemTemplateSubItem & { key: string };

let draftKey = 0;
const withKey = (item: TWorkItemTemplateSubItem): TDraftSubItem => ({ ...item, key: `sub-${draftKey++}` });

/**
 * Edits what a work item template prefills: its name, the work item title and priority, and
 * its sub-work items. Everything else the template saved (labels, assignees, properties) is kept.
 */
export const EditWorkItemTemplateModal = observer(function EditWorkItemTemplateModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, template } = props;
  const { t } = useTranslation();
  const { updateWorkItemTemplate } = useTemplate();
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TIssuePriorities>("none");
  const [subItems, setSubItems] = useState<TDraftSubItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // refs
  const subItemRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusKey = useRef<string | null>(null);

  // Seed on open or when a different template is chosen; a refetch replacing the template
  // object must not wipe in-progress edits
  const templateId = template?.id;
  useEffect(() => {
    if (!isOpen || !template) return;
    setName(template.name);
    setDescription(template.description);
    setTitle(template.template.name);
    setPriority(template.template.priority);
    setSubItems(template.template.sub_issues.map(withKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, templateId]);

  useEffect(() => {
    if (!focusKey.current) return;
    subItemRefs.current[focusKey.current]?.focus();
    focusKey.current = null;
  }, [subItems]);

  const addSubItem = () => {
    const item = withKey({ name: "", description_html: "<p></p>", priority: "none", assignee_ids: [], label_ids: [] });
    focusKey.current = item.key;
    setSubItems((prev) => [...prev, item]);
  };

  const moveSubItem = (index: number, direction: -1 | 1) =>
    setSubItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template || !name.trim()) return;
    setIsSubmitting(true);
    try {
      await updateWorkItemTemplate(workspaceSlug, projectId, template.id, {
        name: name.trim(),
        description: description.trim(),
        template: {
          ...template.template,
          name: title.trim(),
          priority,
          sub_issues: subItems
            .filter((item) => item.name.trim())
            .map((item) => ({
              name: item.name.trim(),
              description_html: item.description_html,
              priority: item.priority,
              assignee_ids: item.assignee_ids,
              label_ids: item.label_ids,
            })),
        },
      });
      onClose();
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("templates.manage.save_error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "h-8 w-full rounded-md border-[0.5px] border-subtle bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus:border-strong";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="md">
        <DialogCloseGroup>
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={t("close")}
            icon={<Icon icon={CloseOutline} />}
            render={<DialogClose />}
          />
        </DialogCloseGroup>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{t("templates.manage.edit_title")}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody tabIndex={0}>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("name")}</span>
                  <Input size="md" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} />
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

                <div className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("templates.manage.work_item.prefill")}</span>
                  <div className="flex items-center gap-2">
                    <input
                      value={title}
                      maxLength={255}
                      placeholder={t("templates.settings.form.work_item.name.placeholder")}
                      aria-label={t("templates.settings.form.work_item.name.placeholder")}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputClass}
                    />
                    <PrioritySelect value={priority} onChange={setPriority} variant="select-md" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("common.sub_work_items", { count: 2 })}</span>
                  {subItems.map((item, index) => (
                    <div key={item.key} className="flex items-center gap-1">
                      <input
                        ref={(el) => {
                          subItemRefs.current[item.key] = el;
                        }}
                        value={item.name}
                        maxLength={255}
                        placeholder={t("sub_work_item.quick_add.placeholder")}
                        onChange={(e) =>
                          setSubItems((prev) =>
                            prev.map((sub) => (sub.key === item.key ? { ...sub, name: e.target.value } : sub))
                          )
                        }
                        onKeyDown={(e) => {
                          // Enter on the last row adds the next one, like the inline sub-work item input
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            if (index === subItems.length - 1) addSubItem();
                            else subItemRefs.current[subItems[index + 1].key]?.focus();
                          }
                        }}
                        className={inputClass}
                      />
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={t("custom_properties.settings.move_up")}
                        icon={<Icon icon={ArrowUpOutline} />}
                        disabled={index === 0}
                        onClick={() => moveSubItem(index, -1)}
                      />
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={t("custom_properties.settings.move_down")}
                        icon={<Icon icon={ArrowDownOutline} />}
                        disabled={index === subItems.length - 1}
                        onClick={() => moveSubItem(index, 1)}
                      />
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={t("common.remove")}
                        icon={<Icon icon={CloseOutline} />}
                        onClick={() => setSubItems((prev) => prev.filter((sub) => sub.key !== item.key))}
                      />
                    </div>
                  ))}
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      stretch="auto"
                      icon={<AddOutline className="size-3.5" />}
                      label={t("sub_work_item.quick_add.button")}
                      onClick={addSubItem}
                    />
                  </div>
                </div>
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
              label={t("save")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
