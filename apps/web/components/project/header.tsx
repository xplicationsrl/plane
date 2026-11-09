/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// i18n
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// ui
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { FolderOutline, ProjectsOutline } from "@makeplane/propel/icons";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { Header } from "@plane/blocks/layout";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";
// plane web constants
// components
import HeaderFilters from "./filters";
import { ProjectFolderFormModal } from "./folders/folder-form-modal";
import { ProjectSearch } from "./search-projects";

export const ProjectsBaseHeader = observer(function ProjectsBaseHeader() {
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();

  const pathname = usePathname();
  const { workspaceSlug } = useParams();
  // states
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  // auth
  const isAuthorizedUser = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const isArchived = pathname.includes("/archives");

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("workspace_projects.label", { count: 2 })}
                icon={<ProjectsOutline className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {isArchived && <Breadcrumbs.Item component={<BreadcrumbLink label="Archived" />} />}
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <ProjectSearch />
        <div className="hidden md:flex">
          <HeaderFilters />
        </div>
        {!isArchived && workspaceSlug && (
          <>
            <ProjectFolderFormModal
              workspaceSlug={workspaceSlug.toString()}
              isOpen={isFolderModalOpen}
              onClose={() => setIsFolderModalOpen(false)}
            />
            <span className="hidden lg:inline-block">
              <Button
                variant="secondary"
                size="md"
                stretch="auto"
                icon={<Icon icon={FolderOutline} />}
                onClick={() => setIsFolderModalOpen(true)}
                label={t("workspace_projects.folders.new")}
              />
            </span>
            <span className="inline-block lg:hidden">
              <IconButton
                variant="secondary"
                size="md"
                icon={<Icon icon={FolderOutline} />}
                aria-label={t("workspace_projects.folders.new")}
                onClick={() => setIsFolderModalOpen(true)}
              />
            </span>
          </>
        )}
        {isAuthorizedUser && !isArchived ? (
          <>
            <span className="hidden sm:inline-block">
              <Button
                variant="primary"
                size="md"
                stretch="auto"
                onClick={() => {
                  toggleCreateProjectModal(true);
                }}
                label={t("workspace_projects.create.label")}
              />
            </span>
            <span className="inline-block sm:hidden">
              <Button
                variant="primary"
                size="md"
                stretch="auto"
                onClick={() => {
                  toggleCreateProjectModal(true);
                }}
                label={t("workspace_projects.label", { count: 1 })}
              />
            </span>
          </>
        ) : (
          <></>
        )}
      </Header.RightItem>
    </Header>
  );
});
