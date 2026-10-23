/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
// components
import { ProjectSelect } from "@/components/dropdowns/project/project-select";
// hooks
import { useSharedWorkItem } from "@/hooks/store/use-shared-work-item";
import { useUser } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

/** Sidebar control listing (and editing) the other projects a work item is shared with. */
export const IssueAlsoInProjects = observer(function IssueAlsoInProjects(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const { linkedProjectIds, fetchLinkedProjects, setLinkedProjects } = useSharedWorkItem();
  const { projectsWithCreatePermissions } = useUser();

  useEffect(() => {
    if (workspaceSlug && projectId && issueId)
      void fetchLinkedProjects(workspaceSlug, projectId, issueId).catch(() => undefined);
  }, [workspaceSlug, projectId, issueId, fetchLinkedProjects]);

  const value = linkedProjectIds[issueId] ?? [];
  // Projects already linked stay listed even when the viewer can't edit them, so they can be unlinked by others
  const canShareInto = (id: string) => !!projectsWithCreatePermissions?.[id] || value.includes(id);

  return (
    <ProjectSelect
      multiple
      value={value}
      onChange={(ids) =>
        void setLinkedProjects(workspaceSlug, projectId, issueId, ids).catch(() =>
          setToast({ type: "error", title: t("toast.error"), message: t("shared_work_items.update_error") })
        )
      }
      excludeProjectId={projectId}
      filterOption={canShareInto}
      disabled={disabled}
      placeholder={t("shared_work_items.none")}
      variant="select-ghost-md"
    />
  );
});
