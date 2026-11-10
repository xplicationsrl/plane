/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Combobox, ComboboxItem, ComboboxList, ComboboxSearch } from "@makeplane/propel/components/combobox";
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
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { EUserPermissions, ROLE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  userId: string;
  /** What to call them in the title: display name, or email when there is none. */
  userName: string;
  workspaceRole: EUserPermissions;
  isOpen: boolean;
  onClose: () => void;
};

type TRoleOption = { key: EUserPermissions; label: string };

/** Project roles a member may hold, given their workspace role: admins stay admins, guests stay guests. */
const roleOptionsFor = (workspaceRole: EUserPermissions): TRoleOption[] => {
  const keys: EUserPermissions[] =
    workspaceRole === EUserPermissions.ADMIN
      ? [EUserPermissions.ADMIN]
      : workspaceRole === EUserPermissions.GUEST
        ? [EUserPermissions.GUEST]
        : [EUserPermissions.MEMBER, EUserPermissions.GUEST];
  return keys.map((key) => ({ key, label: ROLE[key] }));
};

/**
 * Add one workspace member to many projects in one go: search (e.g. "SeSS"), tick or select all
 * shown, pick the role, add.
 */
export const AddMemberToProjectsModal = observer(function AddMemberToProjectsModal(props: Props) {
  const { workspaceSlug, userId, userName, workspaceRole, isOpen, onClose } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { workspaceProjectIds, getPartialProjectById } = useProject();
  const {
    workspace: { addMemberToProjects },
  } = useMember();
  // derived values
  const roleOptions = useMemo(() => roleOptionsFor(workspaceRole), [workspaceRole]);
  // states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [role, setRole] = useState<EUserPermissions>(roleOptions[0].key);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const query = searchTerm.trim().toLowerCase();
  const shownProjectIds = (workspaceProjectIds ?? []).filter((projectId) => {
    const project = getPartialProjectById(projectId);
    if (!project) return false;
    return `${project.identifier} ${project.name}`.toLowerCase().includes(query);
  });

  const handleClose = () => {
    onClose();
    setSearchTerm("");
    setSelectedProjectIds([]);
    setRole(roleOptions[0].key);
  };

  const handleSubmit = async () => {
    if (selectedProjectIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const result = await addMemberToProjects(workspaceSlug, userId, selectedProjectIds, role);
      setToast({
        type: "success",
        title: t("workspace_settings.settings.members.add_to_projects.success_title"),
        message: t("workspace_settings.settings.members.add_to_projects.success", {
          added: result.added + result.updated,
          already: result.already_member,
        }),
      });
      handleClose();
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: error?.error || t("workspace_settings.settings.members.add_to_projects.error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent size="md">
        <DialogMain>
          <DialogHeader>
            <DialogHeading>
              <DialogTitle>
                {t("workspace_settings.settings.members.add_to_projects.title", { name: userName })}
              </DialogTitle>
              <DialogDescription>
                {t("workspace_settings.settings.members.add_to_projects.description")}
              </DialogDescription>
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              {/* `inline open`: the dialog is the surface, so the list renders in place. */}
              <Combobox<string, true>
                inline
                multiple
                open={isOpen}
                value={selectedProjectIds}
                onValueChange={(next) => setSelectedProjectIds(next)}
                inputValue={searchTerm}
                onInputValueChange={(next, details) => {
                  // Base UI clears the query after every pick in multiple mode; keep it so "select all shown" stays useful.
                  if (details.reason === "input-clear") return;
                  setSearchTerm(next);
                }}
              >
                <div className="rounded-md border border-subtle">
                  <ComboboxSearch
                    placeholder={t("workspace_settings.settings.members.add_to_projects.search_placeholder")}
                    aria-label={t("common.projects")}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-subtle px-3 py-1.5 text-11 text-tertiary">
                    <span>
                      {t("workspace_settings.settings.members.add_to_projects.selected", {
                        count: selectedProjectIds.length,
                      })}
                    </span>
                    <span className="flex items-center gap-3">
                      <button
                        type="button"
                        className="font-medium text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline"
                        disabled={shownProjectIds.length === 0}
                        onClick={() => setSelectedProjectIds([...new Set([...selectedProjectIds, ...shownProjectIds])])}
                      >
                        {t("workspace_settings.settings.members.add_to_projects.select_all_shown", {
                          count: shownProjectIds.length,
                        })}
                      </button>
                      <button
                        type="button"
                        className="font-medium hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline"
                        disabled={selectedProjectIds.length === 0}
                        onClick={() => setSelectedProjectIds([])}
                      >
                        {t("workspace_settings.settings.members.add_to_projects.clear_selection")}
                      </button>
                    </span>
                  </div>
                  <div className="vertical-scrollbar scrollbar-md max-h-72 overflow-y-auto border-t border-subtle">
                    {shownProjectIds.length === 0 ? (
                      <p className="px-3 py-6 text-center text-13 text-placeholder">
                        {t("workspace_settings.settings.members.add_to_projects.no_projects")}
                      </p>
                    ) : (
                      <ComboboxList aria-label={t("common.projects")}>
                        {shownProjectIds.map((projectId) => {
                          const project = getPartialProjectById(projectId);
                          if (!project) return null;
                          return (
                            <ComboboxItem
                              key={project.id}
                              value={project.id}
                              selection="checkbox"
                              label={project.name}
                              icon={<Logo logo={project.logo_props} size={16} />}
                            />
                          );
                        })}
                      </ComboboxList>
                    )}
                  </div>
                </div>
              </Combobox>
              <div className="flex items-center justify-between gap-3">
                <span className="text-13 text-secondary">
                  {t("workspace_settings.settings.members.add_to_projects.role")}
                </span>
                <div className="w-32">
                  <Select<TRoleOption>
                    value={roleOptions.find((option) => option.key === role) ?? null}
                    onChange={(val) => setRole(Number(val) as EUserPermissions)}
                    getValues={() => roleOptions}
                    getOptionValue={(option) => String(option.key)}
                    getOptionLabel={(option) => option.label}
                    showSearch={false}
                    pinSelected={false}
                    disabled={roleOptions.length === 1}
                  >
                    <Select.Trigger<TRoleOption> variant="select-ghost-md">
                      <span className="min-w-0 flex-1 truncate text-left">{ROLE[role]}</span>
                    </Select.Trigger>
                  </Select>
                </div>
              </div>
            </div>
          </DialogBody>
        </DialogMain>
        <DialogActions>
          <Button variant="secondary" size="md" stretch="auto" label={t("cancel")} onClick={handleClose} />
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label={
              isSubmitting
                ? t("workspace_settings.settings.members.add_to_projects.submitting")
                : t("workspace_settings.settings.members.add_to_projects.submit", { count: selectedProjectIds.length })
            }
            onClick={() => void handleSubmit()}
            loading={isSubmitting}
            disabled={selectedProjectIds.length === 0}
          />
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
});
