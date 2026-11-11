/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { MemberSelect as MemberSelectBlock } from "@plane/blocks/property-select";
import type { MemberOption, MemberSelectVariant } from "@plane/blocks/property-select";
import type { SelectPaginationParams, SelectTooltip, SelectTooltipOverride } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import type { TPaginatedResponse } from "@plane/types";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";

type MemberSelectWebCommonProps = {
  /** value-agnostic e2e selector — forwarded to the block's trigger as data-testid */
  testId?: string;
  /** Project whose members are offered. Omit it for the workspace roster. */
  projectId?: string;
  /**
   * A bounded, explicit set of member ids to offer instead of the project / workspace roster,
   * client-filtered by the search box.
   */
  memberIds?: string[];
  /**
   * Work item assignee pickers only: also offer workspace members outside `projectId` when the
   * current user can manage the project's members. The work item API adds them to the project.
   */
  allowAddToProject?: boolean;
  /** Ids to hide from the options even though they're in scope (e.g. members picked in sibling rows). */
  excludeIds?: string[];
  variant: MemberSelectVariant;
  /** Override the variant's default text-label visibility (avatars stay regardless). */
  showLabel?: boolean;
  /** Pins a "clear" row to the top of the list. Single-select only. */
  clearable?: boolean;
  /** Label shown for the "clear" row. Defaults to the placeholder or "No assignee". Single-select only. */
  clearLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  onClose?: () => void;
  className?: string;
  tooltip?: SelectTooltip;
  /** Tab order of the trigger, for forms that sequence focus explicitly (`ETabIndices`). */
  tabIndex?: number;
};

export type MemberSelectWebProps = MemberSelectWebCommonProps &
  (
    | { multiple: true; value: string[]; onChange: (ids: string[]) => void }
    | { multiple?: false; value: string | null | undefined; onChange: (id: string) => void }
  );

/**
 * Web binding for the presentational `MemberSelect` block. Offers the project roster (guests
 * excluded) when `projectId` is set, the workspace roster otherwise, or an explicit `memberIds` set —
 * fetched on first open when the project roster is not loaded yet — and resolves the selected id(s)
 * into `MemberOption`s for the trigger.
 *
 * Users who can manage the project's members (project admins, or workspace admins in the project) are
 * also offered workspace members (member role and up) who are not in the project yet; the API adds
 * them to the project when they are assigned, and the project roster is refetched afterwards.
 *
 * CE change: EE sources a paginated members "lite" resource with server-side scopes (`scope`,
 * `teamspaceId`, `scopedProjectIds`, `getPage`); CE reads the member store and serves one page,
 * filtering the search client-side. Suspended workspace members are listed as disabled rows with a
 * "Suspended" badge, as the legacy CE dropdown did (a selected one stays enabled so it can still be
 * removed, and the trigger keeps showing it).
 */
export const MemberSelect = observer(function MemberSelect(props: MemberSelectWebProps) {
  const {
    projectId,
    memberIds,
    excludeIds,
    allowAddToProject,
    variant,
    showLabel,
    clearable,
    clearLabel,
    disabled,
    placeholder,
    onClose,
    className,
    tooltip,
    testId,
    tabIndex,
  } = props;
  // router params
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  // store hooks
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
    workspace: { workspaceMemberIds, isUserSuspended, getWorkspaceMemberDetails },
  } = useMember();
  const { data: currentUser } = useUser();
  const { allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  // Mirrors the API's `can_manage_project_members`.
  const canAddProjectMembers =
    !!allowAddToProject &&
    !!projectId &&
    !!slug &&
    !memberIds &&
    (allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, slug, projectId) ||
      (allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, slug) &&
        getProjectRoleByWorkspaceSlugAndProjectId(slug, projectId) !== undefined));
  // translation
  const { t } = useTranslation();
  const resolvedTooltip = useMemo<SelectTooltipOverride | undefined>(() => {
    if (!tooltip) return undefined;
    const override = typeof tooltip === "object" ? tooltip : undefined;
    return {
      heading: override?.heading ?? t("common.members"),
      emptyContent: override?.emptyContent ?? t("common.none"),
    };
  }, [tooltip, t]);
  const excludeSet = useMemo(() => (excludeIds?.length ? new Set(excludeIds) : undefined), [excludeIds]);
  const youLabel = t("you");

  // Resolves an id to a MemberOption — the current user carries a "(You)" suffix everywhere it is
  // shown: trigger label, option rows and read-only display. `name` keeps the plain name for the avatar.
  const toOption = useCallback(
    (id: string): MemberOption => {
      const member = getUserDetails(id);
      const name = member?.display_name ?? "";
      return {
        id,
        display_name: id === currentUser?.id ? `${name} (${youLabel})` : name,
        name,
        avatar_url: getFileURL(member?.avatar_url ?? ""),
        suspended: !!slug && isUserSuspended(id, slug),
      };
    },
    [getUserDetails, currentUser?.id, youLabel, slug, isUserSuspended]
  );

  const getValues = useCallback(
    async ({ search }: SelectPaginationParams): Promise<TPaginatedResponse<MemberOption[]>> => {
      let rosterIds = memberIds ?? (projectId ? getProjectMemberIds(projectId, false) : workspaceMemberIds);
      if (!rosterIds && !memberIds && projectId && slug) {
        await fetchProjectMembers(slug, projectId);
        rosterIds = getProjectMemberIds(projectId, false);
      }
      if (canAddProjectMembers && rosterIds) {
        // Append workspace members outside the project; guests cannot be assignees.
        const inProject = new Set(projectId ? (getProjectMemberIds(projectId, true) ?? []) : []);
        const outsideProject = (workspaceMemberIds ?? []).filter((id) => {
          if (inProject.has(id)) return false;
          const role = getWorkspaceMemberDetails(id)?.role;
          return role !== undefined && Number(role) >= EUserPermissions.MEMBER;
        });
        rosterIds = [...rosterIds, ...outsideProject];
      }
      const query = search?.trim().toLowerCase();
      const results: MemberOption[] = [];
      for (const id of rosterIds ?? []) {
        const member = getUserDetails(id);
        if (!member) continue;
        const searchText = `${member.display_name} ${member.first_name} ${member.last_name}`.toLowerCase();
        if (query && !searchText.includes(query)) continue;
        // Legacy CE ordering: the current user leads the roster (the block then pins the selected ones).
        if (id === currentUser?.id) results.unshift(toOption(id));
        else results.push(toOption(id));
      }
      return { results, next_page_results: false };
    },
    [
      memberIds,
      projectId,
      slug,
      workspaceMemberIds,
      getProjectMemberIds,
      fetchProjectMembers,
      getUserDetails,
      toOption,
      currentUser?.id,
      canAddProjectMembers,
      getWorkspaceMemberDetails,
    ]
  );

  // After picking someone outside the project, refetch the roster once the update has gone through,
  // so the project member store reflects the member the API just added.
  const { onChange: onChangeProp } = props;
  const handleChange = useCallback(
    (ids: string[] | string) => {
      const result: unknown = (onChangeProp as (value: string[] | string) => unknown)(ids);
      if (!canAddProjectMembers || !projectId || !slug) return;
      const projectIds = new Set(getProjectMemberIds(projectId, true) ?? []);
      const picked = Array.isArray(ids) ? ids : [ids];
      if (!picked.some((id) => id && !projectIds.has(id))) return;
      void Promise.resolve(result)
        .catch(() => undefined)
        .then(() => fetchProjectMembers(slug, projectId))
        .catch(() => undefined);
    },
    [onChangeProp, canAddProjectMembers, projectId, slug, getProjectMemberIds, fetchProjectMembers]
  );

  const filterOption = useCallback((option: MemberOption) => !excludeSet?.has(option.id), [excludeSet]);

  if (props.multiple) {
    return (
      <MemberSelectBlock
        multiple
        testId={testId}
        getValues={getValues}
        // Resolved in the observer render so MobX re-renders once the members load.
        value={props.value.map(toOption)}
        onChange={handleChange}
        variant={variant}
        showLabel={showLabel}
        disabled={disabled}
        placeholder={placeholder}
        onClose={onClose}
        className={className}
        tooltip={resolvedTooltip}
        filterOption={excludeSet ? filterOption : undefined}
        tabIndex={tabIndex}
      />
    );
  }
  return (
    <MemberSelectBlock
      multiple={false}
      testId={testId}
      getValues={getValues}
      value={props.value ? toOption(props.value) : null}
      onChange={handleChange}
      variant={variant}
      showLabel={showLabel}
      clearable={clearable}
      clearLabel={clearLabel}
      disabled={disabled}
      placeholder={placeholder}
      onClose={onClose}
      className={className}
      tooltip={resolvedTooltip}
      filterOption={excludeSet ? filterOption : undefined}
      tabIndex={tabIndex}
    />
  );
});
