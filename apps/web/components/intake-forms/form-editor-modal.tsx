/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Checkbox } from "@makeplane/propel/components/checkbox";
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
import { ArrowDownOutline, ArrowUpOutline, CloseOutline } from "@makeplane/propel/icons";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIntakeForm, TIntakeFormField } from "@plane/types";
// hooks
import { useCustomProperty } from "@/hooks/store/use-custom-property";
import { useIntakeForm } from "@/hooks/store/use-intake-form";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  form?: TIntakeForm;
};

type TCatalogItem = { key: string; label: string };

const STANDARD_FIELDS = ["description", "priority", "submitter_name", "submitter_email"] as const;
// People properties would expose the member list on a public page
const PUBLIC_PROPERTY_TYPES = new Set(["text", "number", "date", "select", "multi_select", "checkbox", "url"]);

const textareaClass =
  "w-full rounded-md border-[0.5px] border-subtle bg-transparent px-3 py-2 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus:border-strong";

export const IntakeFormEditorModal = observer(function IntakeFormEditorModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, form } = props;
  const { t } = useTranslation();
  const { createForm, updateForm } = useIntakeForm();
  const { getProjectProperties, ensureProjectProperties } = useCustomProperty();
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [fields, setFields] = useState<TIntakeFormField[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(form?.name ?? "");
    setDescription(form?.description ?? "");
    setSuccessMessage(form?.success_message ?? "");
    setFields(
      form?.fields ?? [
        { key: "description", label: "", help_text: "", required: true },
        { key: "submitter_email", label: "", help_text: "", required: true },
      ]
    );
    void ensureProjectProperties(workspaceSlug, projectId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form]);

  const properties = getProjectProperties(projectId).filter((property) =>
    PUBLIC_PROPERTY_TYPES.has(property.property_type)
  );
  const catalog: TCatalogItem[] = useMemo(
    () => [
      ...STANDARD_FIELDS.map((key) => ({ key, label: t(`intake_forms.fields.${key}`) })),
      ...properties.map((property) => ({ key: `property:${property.id}`, label: property.name })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [properties.length, t]
  );
  const labelOf = (key: string) => catalog.find((item) => item.key === key)?.label ?? key;
  const available = catalog.filter((item) => !fields.some((field) => field.key === item.key));

  const updateField = (key: string, data: Partial<TIntakeFormField>) =>
    setFields((prev) => prev.map((field) => (field.key === key ? { ...field, ...data } : field)));

  const moveField = (index: number, direction: -1 | 1) =>
    setFields((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    const payload = { name: name.trim(), description, success_message: successMessage, fields };
    try {
      if (form) await updateForm(workspaceSlug, projectId, form.id, payload);
      else await createForm(workspaceSlug, projectId, payload);
      onClose();
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("intake_forms.save_error") });
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
                <DialogTitle>{form ? t("intake_forms.edit_title") : t("intake_forms.create_title")}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody tabIndex={0}>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("intake_forms.name")}</span>
                  <Input
                    size="md"
                    value={name}
                    maxLength={255}
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens to name the form
                    autoFocus
                    placeholder={t("intake_forms.name_placeholder")}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("intake_forms.intro")}</span>
                  <textarea
                    rows={2}
                    value={description}
                    placeholder={t("intake_forms.intro_placeholder")}
                    onChange={(e) => setDescription(e.target.value)}
                    className={textareaClass}
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-body-xs-medium text-secondary">{t("intake_forms.questions")}</span>
                  <div className="flex items-center gap-2 rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-body-xs-regular text-secondary">
                    <span className="grow">{t("intake_forms.fields.name")}</span>
                    <span className="text-caption-sm-regular text-tertiary">{t("intake_forms.always_required")}</span>
                  </div>
                  {fields.map((field, index) => (
                    <div
                      key={field.key}
                      className="flex flex-col gap-2 rounded-md border-[0.5px] border-subtle px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="grow truncate text-body-xs-medium text-primary">{labelOf(field.key)}</span>
                        <Checkbox
                          checked={field.required}
                          onCheckedChange={(checked) => updateField(field.key, { required: checked === true })}
                          label={t("intake_forms.required")}
                        />
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={t("custom_properties.settings.move_up")}
                          icon={<Icon icon={ArrowUpOutline} />}
                          disabled={index === 0}
                          onClick={() => moveField(index, -1)}
                        />
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={t("custom_properties.settings.move_down")}
                          icon={<Icon icon={ArrowDownOutline} />}
                          disabled={index === fields.length - 1}
                          onClick={() => moveField(index, 1)}
                        />
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={t("common.remove")}
                          icon={<Icon icon={CloseOutline} />}
                          onClick={() => setFields((prev) => prev.filter((item) => item.key !== field.key))}
                        />
                      </div>
                      <Input
                        size="md"
                        value={field.label}
                        maxLength={255}
                        placeholder={t("intake_forms.question_label_placeholder", { label: labelOf(field.key) })}
                        aria-label={t("intake_forms.question_label")}
                        onChange={(e) => updateField(field.key, { label: e.target.value })}
                      />
                    </div>
                  ))}
                  {available.length > 0 && (
                    <div>
                      <Select<TCatalogItem>
                        getValues={() => available}
                        value={null}
                        onChange={(key) =>
                          setFields((prev) => [...prev, { key, label: "", help_text: "", required: false }])
                        }
                        showSearch={available.length > 7}
                        pinSelected={false}
                        getOptionValue={(item) => item.key}
                        getOptionLabel={(item) => item.label}
                      >
                        <Select.Trigger<TCatalogItem> variant="pill-md">
                          {() => <span>{t("intake_forms.add_question")}</span>}
                        </Select.Trigger>
                      </Select>
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("intake_forms.success_message")}</span>
                  <Input
                    size="md"
                    value={successMessage}
                    placeholder={t("intake_forms.success_message_placeholder")}
                    onChange={(e) => setSuccessMessage(e.target.value)}
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
              label={form ? t("save") : t("intake_forms.create")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
