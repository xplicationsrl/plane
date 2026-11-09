/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissionsLevel, EUserPermissions } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/blocks/empty-state";
import { ContentWrapper } from "@plane/blocks/layout";
// components
import { calculateTotalFilters } from "@plane/utils";
import { ProjectsLoader } from "@/components/ui/loader/projects-loader";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useProjectFolder } from "@/hooks/store/use-project-folder";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { ProjectCard } from "./card";
import { ProjectFolderSection } from "./folders/folder-section";

/** Key of the "No folder" group in the collapsed list; can't clash with a folder id. */
const NO_FOLDER_KEY = "no-folder";

type TProjectCardListProps = {
  totalProjectIds?: string[];
  filteredProjectIds?: string[];
};

export const ProjectCardList = observer(function ProjectCardList(props: TProjectCardListProps) {
  const { totalProjectIds: totalProjectIdsProps, filteredProjectIds: filteredProjectIdsProps } = props;
  // router
  const { workspaceSlug } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // Which folders are folded shut is a personal choice, so it stays in this browser.
  const { storedValue: collapsedFolderIds, setValue: setCollapsedFolderIds } = useLocalStorage<string[]>(
    `project_folders_collapsed_${workspaceSlug?.toString() ?? ""}`,
    []
  );
  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  const {
    loader,
    fetchStatus,
    workspaceProjectIds: storeWorkspaceProjectIds,
    filteredProjectIds: storeFilteredProjectIds,
    getProjectById,
  } = useProject();
  const { currentWorkspaceDisplayFilters, currentWorkspaceFilters, searchQuery } = useProjectFilter();
  const { currentWorkspaceFolders, fetchFolders } = useProjectFolder();
  const { allowPermissions } = useUserPermissions();
  // fetch the folders the cards are grouped by
  useSWR(workspaceSlug ? `PROJECT_FOLDERS_${workspaceSlug.toString()}` : null, () =>
    fetchFolders(workspaceSlug?.toString() ?? "")
  );

  // derived values
  const workspaceProjectIds = totalProjectIdsProps ?? storeWorkspaceProjectIds;
  const filteredProjectIds = filteredProjectIdsProps ?? storeFilteredProjectIds;

  // permissions
  const canPerformEmptyStateActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  if (!filteredProjectIds || !workspaceProjectIds || loader === "init-loader" || fetchStatus !== "complete")
    return <ProjectsLoader />;

  if (workspaceProjectIds?.length === 0 && !currentWorkspaceDisplayFilters?.archived_projects)
    return (
      <EmptyStateDetailed
        title={t("workspace_projects.empty_state.general.title")}
        description={t("workspace_projects.empty_state.general.description")}
        assetKey="project"
        assetClassName="size-40"
        actions={[
          {
            label: t("workspace_projects.empty_state.general.primary_button.text"),
            onClick: () => {
              toggleCreateProjectModal(true);
            },
            disabled: !canPerformEmptyStateActions,
            variant: "primary",
          },
        ]}
      />
    );

  // A status tab with nothing in it gets its own message; a search or filter that finds nothing keeps the usual one.
  const completion = currentWorkspaceDisplayFilters?.completion;
  if (
    filteredProjectIds.length === 0 &&
    !currentWorkspaceDisplayFilters?.archived_projects &&
    completion &&
    completion !== "all" &&
    searchQuery.trim() === "" &&
    !currentWorkspaceDisplayFilters?.my_projects &&
    calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
  )
    return (
      <EmptyStateDetailed
        title={t(`workspace_projects.completion.empty.${completion}.title`)}
        description={t(`workspace_projects.completion.empty.${completion}.description`)}
        assetKey="project"
        assetClassName="size-40"
      />
    );

  if (filteredProjectIds.length === 0)
    return (
      <EmptyStateDetailed
        title={
          currentWorkspaceDisplayFilters?.archived_projects &&
          calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? t("workspace_empty_state.projects_archived.title")
            : t("common_empty_state.search.title")
        }
        description={
          currentWorkspaceDisplayFilters?.archived_projects &&
          calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? t("workspace_empty_state.projects_archived.description")
            : t("common_empty_state.search.description")
        }
        assetKey={
          currentWorkspaceDisplayFilters?.archived_projects &&
          calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? "archived-work-item"
            : "search"
        }
        assetClassName="size-40"
      />
    );

  const renderCards = (projectIds: string[]) => (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      {projectIds.map((projectId) => {
        const projectDetails = getProjectById(projectId);
        if (!projectDetails) return;
        return <ProjectCard key={projectDetails.id} project={projectDetails} />;
      })}
    </div>
  );

  // The archive, and a workspace without folders, stay one flat grid.
  if (currentWorkspaceDisplayFilters?.archived_projects || currentWorkspaceFolders.length === 0 || !workspaceSlug)
    return <ContentWrapper>{renderCards(filteredProjectIds)}</ContentWrapper>;

  const projectIdsByFolder: Record<string, string[]> = {};
  const projectIdsWithoutFolder: string[] = [];
  const folderIds = new Set(currentWorkspaceFolders.map((folder) => folder.id));
  filteredProjectIds.forEach((projectId) => {
    const folderId = getProjectById(projectId)?.folder;
    if (folderId && folderIds.has(folderId)) (projectIdsByFolder[folderId] ??= []).push(projectId);
    else projectIdsWithoutFolder.push(projectId);
  });
  // While searching or filtering, folders with no match would only be noise.
  const hideEmptyFolders =
    searchQuery.trim() !== "" ||
    !!currentWorkspaceDisplayFilters?.my_projects ||
    calculateTotalFilters(currentWorkspaceFilters ?? {}) !== 0;
  const collapsed = new Set(collapsedFolderIds ?? []);
  const toggleFolder = (key: string) => {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    setCollapsedFolderIds([...collapsed]);
  };

  return (
    <ContentWrapper>
      <div className="flex flex-col gap-8">
        {currentWorkspaceFolders.map((folder) => {
          const projectIds = projectIdsByFolder[folder.id] ?? [];
          if (projectIds.length === 0 && hideEmptyFolders) return null;
          return (
            <ProjectFolderSection
              key={folder.id}
              workspaceSlug={workspaceSlug.toString()}
              folder={folder}
              count={projectIds.length}
              isCollapsed={collapsed.has(folder.id)}
              onToggle={() => toggleFolder(folder.id)}
            >
              {renderCards(projectIds)}
            </ProjectFolderSection>
          );
        })}
        {projectIdsWithoutFolder.length > 0 && (
          <ProjectFolderSection
            workspaceSlug={workspaceSlug.toString()}
            count={projectIdsWithoutFolder.length}
            isCollapsed={collapsed.has(NO_FOLDER_KEY)}
            onToggle={() => toggleFolder(NO_FOLDER_KEY)}
          >
            {renderCards(projectIdsWithoutFolder)}
          </ProjectFolderSection>
        )}
      </div>
    </ContentWrapper>
  );
});
