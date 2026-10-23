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
import { AddOutline, CloseOutline } from "@makeplane/propel/icons";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TCustomProperty, TCustomPropertyOption, TCustomPropertyType } from "@plane/types";
// hooks
import { useCustomProperty } from "@/hooks/store/use-custom-property";
// local imports
import { CUSTOM_PROPERTY_TYPES } from "../constants";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  /** The field being edited; undefined creates a new one. */
  property?: TCustomProperty;
};

type TDraftOption = Omit<TCustomPropertyOption, "id"> & { id?: string; key: string };

const OPTION_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#ec4899", "#6b7280"];

let draftKey = 0;
const newDraftOption = (index: number): TDraftOption => ({
  key: `draft-${draftKey++}`,
  name: "",
  color: OPTION_COLORS[index % OPTION_COLORS.length],
});

export const CustomPropertyFormModal = observer(function CustomPropertyFormModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, property } = props;
  const { t } = useTranslation();
  const { createProperty, updateProperty } = useCustomProperty();
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [propertyType, setPropertyType] = useState<TCustomPropertyType>("text");
  const [options, setOptions] = useState<TDraftOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // refs
  const optionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusOptionKey = useRef<string | null>(null);
  // derived values
  const hasOptions = propertyType === "select" || propertyType === "multi_select";

  useEffect(() => {
    if (!isOpen) return;
    setName(property?.name ?? "");
    setDescription(property?.description ?? "");
    setPropertyType(property?.property_type ?? "text");
    setOptions(
      (property?.options ?? []).map(({ id, name: optionName, color }) => ({ id, name: optionName, color, key: id }))
    );
    setError(null);
  }, [isOpen, property]);

  useEffect(() => {
    if (hasOptions && options.length === 0) setOptions([newDraftOption(0)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOptions]);

  useEffect(() => {
    if (!focusOptionKey.current) return;
    optionRefs.current[focusOptionKey.current]?.focus();
    focusOptionKey.current = null;
  }, [options]);

  const addOption = () => {
    const option = newDraftOption(options.length);
    focusOptionKey.current = option.key;
    setOptions((prev) => [...prev, option]);
  };

  const updateOption = (key: string, data: Partial<TDraftOption>) =>
    setOptions((prev) => prev.map((option) => (option.key === key ? { ...option, ...data } : option)));

  const removeOption = (key: string) => setOptions((prev) => prev.filter((option) => option.key !== key));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("custom_properties.form.name_required"));
      return;
    }
    const payload: Partial<TCustomProperty> = {
      name: name.trim(),
      description: description.trim(),
      ...(property ? {} : { property_type: propertyType }),
      ...(hasOptions
        ? {
            options: options
              .filter((option) => option.name.trim())
              .map(({ id, name: optionName, color }) => ({ id: id ?? "", name: optionName.trim(), color })),
          }
        : {}),
    };
    if (hasOptions && !payload.options?.length) {
      setError(t("custom_properties.form.options_required"));
      return;
    }
    setIsSubmitting(true);
    try {
      if (property) await updateProperty(workspaceSlug, projectId, property.id, payload);
      else await createProperty(workspaceSlug, projectId, payload);
      onClose();
    } catch (err) {
      const errors = err as Record<string, string[] | string> | undefined;
      const first = errors ? Object.values(errors)[0] : undefined;
      setToast({
        type: "error",
        title: t("toast.error"),
        message: (Array.isArray(first) ? first[0] : first) ?? t("custom_properties.form.save_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions = CUSTOM_PROPERTY_TYPES;
  const selectedType = typeOptions.find((type) => type.key === propertyType) ?? null;

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
                <DialogTitle>
                  {property ? t("custom_properties.form.edit_title") : t("custom_properties.form.create_title")}
                </DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody tabIndex={0}>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("custom_properties.form.name")}</span>
                  <Input
                    size="md"
                    value={name}
                    maxLength={255}
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens to type a name
                    autoFocus
                    placeholder={t("custom_properties.form.name_placeholder")}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                  />
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("custom_properties.form.type")}</span>
                  <Select<(typeof typeOptions)[number]>
                    getValues={() => typeOptions}
                    value={selectedType}
                    onChange={(key) => setPropertyType(key as TCustomPropertyType)}
                    disabled={!!property}
                    showSearch={false}
                    pinSelected={false}
                    getOptionValue={(type) => type.key}
                    getOptionLabel={(type) => t(type.i18n_label)}
                    getOptionIcon={(type) => <type.icon className="size-4" />}
                  >
                    <Select.Trigger<(typeof typeOptions)[number]> variant="select-md" disabled={!!property}>
                      {(types) => (
                        <span className="flex min-w-0 grow items-center gap-2 truncate">
                          {types[0] && (
                            <>
                              {(() => {
                                const TypeIcon = types[0].icon;
                                return <TypeIcon className="size-4 flex-shrink-0" />;
                              })()}
                              <span className="truncate">{t(types[0].i18n_label)}</span>
                            </>
                          )}
                        </span>
                      )}
                    </Select.Trigger>
                  </Select>
                  {property && (
                    <span className="text-caption-sm-regular text-placeholder">
                      {t("custom_properties.form.type_locked")}
                    </span>
                  )}
                </div>

                {hasOptions && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-body-xs-medium text-secondary">{t("custom_properties.form.options")}</span>
                    <div className="flex flex-col gap-1.5">
                      {options.map((option, index) => (
                        <div key={option.key} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={option.color}
                            onChange={(e) => updateOption(option.key, { color: e.target.value })}
                            className="size-6 flex-shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                            aria-label={t("custom_properties.form.option_color")}
                          />
                          <input
                            ref={(el) => {
                              optionRefs.current[option.key] = el;
                            }}
                            value={option.name}
                            maxLength={255}
                            placeholder={t("custom_properties.form.option_placeholder", { index: index + 1 })}
                            onChange={(e) => {
                              updateOption(option.key, { name: e.target.value });
                              setError(null);
                            }}
                            onKeyDown={(e) => {
                              // Enter on the last option adds the next one, like a list in a doc
                              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                if (index === options.length - 1) addOption();
                                else {
                                  const next = options[index + 1];
                                  optionRefs.current[next.key]?.focus();
                                }
                              }
                            }}
                            className="h-8 w-full rounded-md border-[0.5px] border-subtle bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus:border-strong"
                          />
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label={t("common.remove")}
                            icon={<Icon icon={CloseOutline} />}
                            onClick={() => removeOption(option.key)}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        stretch="auto"
                        icon={<AddOutline className="size-3.5" />}
                        label={t("custom_properties.form.add_option")}
                        onClick={addOption}
                      />
                    </div>
                  </div>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-body-xs-medium text-secondary">{t("custom_properties.form.description")}</span>
                  <Input
                    size="md"
                    value={description}
                    placeholder={t("custom_properties.form.description_placeholder")}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>

                {error && <p className="text-body-xs-regular text-danger-primary">{error}</p>}
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
              loading={isSubmitting}
              label={property ? t("save") : t("custom_properties.form.create")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
