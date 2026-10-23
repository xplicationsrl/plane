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
  ArrowDownOutline,
  ArrowUpOutline,
  DeleteOutline,
  EditOutline,
  MoreHorizontalOutline,
  PropertiesOutline,
} from "@makeplane/propel/icons";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TCustomProperty } from "@plane/types";
// hooks
import { useCustomProperty } from "@/hooks/store/use-custom-property";
// local imports
import { CUSTOM_PROPERTY_TYPES, getCustomPropertyTypeIcon } from "../constants";
import { CustomPropertyFormModal } from "./property-form-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** Only project admins manage fields; everyone else sees the list read-only. */
  canEdit: boolean;
};

export const ProjectCustomPropertiesSettings = observer(function ProjectCustomPropertiesSettings(props: Props) {
  const { workspaceSlug, projectId, canEdit } = props;
  const { t } = useTranslation();
  const { getProjectProperties, fetchProjectProperties, updateProperty, deleteProperty } = useCustomProperty();
  // states
  const [formState, setFormState] = useState<{ open: boolean; property?: TCustomProperty }>({ open: false });
  const [deleting, setDeleting] = useState<TCustomProperty | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  useEffect(() => {
    if (workspaceSlug && projectId) void fetchProjectProperties(workspaceSlug, projectId).catch(() => undefined);
  }, [workspaceSlug, projectId, fetchProjectProperties]);

  const properties = getProjectProperties(projectId, true);

  const handleError = () =>
    setToast({ type: "error", title: t("toast.error"), message: t("custom_properties.form.save_error") });

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= properties.length) return;
    // Place the field between its new neighbours
    const before = properties[direction === -1 ? target - 1 : target]?.sort_order;
    const after = properties[direction === -1 ? target : target + 1]?.sort_order;
    const sortOrder =
      before === undefined ? (after ?? 0) - 10000 : after === undefined ? before + 10000 : (before + after) / 2;
    try {
      await updateProperty(workspaceSlug, projectId, properties[index].id, { sort_order: sortOrder });
    } catch {
      handleError();
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleteSubmitting(true);
    try {
      await deleteProperty(workspaceSlug, projectId, deleting.id);
      setDeleting(null);
    } catch {
      handleError();
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-body-sm-regular text-tertiary">{t("custom_properties.settings.description")}</p>
        {canEdit && (
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            icon={<AddOutline className="size-3.5" />}
            label={t("custom_properties.settings.add")}
            onClick={() => setFormState({ open: true })}
          />
        )}
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-subtle px-6 py-10 text-center">
          <PropertiesOutline className="size-6 text-placeholder" />
          <p className="text-body-sm-medium text-secondary">{t("custom_properties.settings.empty_title")}</p>
          <p className="max-w-md text-body-xs-regular text-tertiary">
            {t("custom_properties.settings.empty_description")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-subtle-1 rounded-lg border border-subtle">
          {properties.map((property, index) => {
            const TypeIcon = getCustomPropertyTypeIcon(property.property_type);
            const typeLabel = CUSTOM_PROPERTY_TYPES.find((type) => type.key === property.property_type)?.i18n_label;
            return (
              <li key={property.id} className="flex items-center gap-3 px-4 py-3">
                <TypeIcon className="size-4 flex-shrink-0 text-tertiary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm-medium text-primary">{property.name}</span>
                  <span className="flex min-w-0 items-center gap-2 text-caption-sm-regular text-tertiary">
                    <span>{typeLabel ? t(typeLabel) : property.property_type}</span>
                    {property.options.length > 0 && (
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        {property.options.slice(0, 6).map((option) => (
                          <span key={option.id} className="flex items-center gap-1">
                            <span className="size-2 rounded-full" style={{ backgroundColor: option.color }} />
                            <span className="truncate">{option.name}</span>
                          </span>
                        ))}
                        {property.options.length > 6 && <span>+{property.options.length - 6}</span>}
                      </span>
                    )}
                    {property.description && <span className="truncate">· {property.description}</span>}
                  </span>
                </div>
                <Tooltip label={t("custom_properties.settings.visible")}>
                  <span className="flex items-center">
                    <Switch
                      size="sm"
                      checked={property.is_active}
                      disabled={!canEdit}
                      aria-label={t("custom_properties.settings.visible")}
                      onCheckedChange={(checked) =>
                        void updateProperty(workspaceSlug, projectId, property.id, { is_active: checked }).catch(
                          handleError
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
                        onClick={() => setFormState({ open: true, property })}
                      />
                      {index > 0 && (
                        <MenuItem
                          icon={<Icon icon={ArrowUpOutline} />}
                          label={t("custom_properties.settings.move_up")}
                          onClick={() => void move(index, -1)}
                        />
                      )}
                      {index < properties.length - 1 && (
                        <MenuItem
                          icon={<Icon icon={ArrowDownOutline} />}
                          label={t("custom_properties.settings.move_down")}
                          onClick={() => void move(index, 1)}
                        />
                      )}
                      <MenuItem
                        icon={<Icon icon={DeleteOutline} />}
                        label={t("common.delete")}
                        onClick={() => setDeleting(property)}
                      />
                    </MenuContent>
                  </Menu>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CustomPropertyFormModal
        isOpen={formState.open}
        onClose={() => setFormState({ open: false })}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        property={formState.property}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        handleClose={() => setDeleting(null)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleteSubmitting}
        title={t("custom_properties.delete.title")}
        content={t("custom_properties.delete.description", { name: deleting?.name ?? "" })}
      />
    </div>
  );
});
