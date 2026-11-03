/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { CircleDashed } from "lucide-react";
import { Collapsible } from "@makeplane/propel/components/collapsible";
import { ALL_ISSUES } from "@plane/constants";
import type { IGroupByColumn, TIssue, TIssueServiceType, TSubIssueOperations } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { moveWorkItemId } from "@plane/utils";
import { SubIssuesListItem } from "./list-item";

interface TSubIssuesListGroupProps {
  workItemIds: string[];
  projectId: string;
  workspaceSlug: string;
  group: IGroupByColumn;
  serviceType: TIssueServiceType;
  canEdit: boolean;
  canReorder: boolean;
  parentIssueId: string;
  rootIssueId: string;
  handleIssueCrudState: (
    key: "create" | "existing" | "update" | "delete",
    issueId: string,
    issue?: TIssue | null
  ) => void;
  subIssueOperations: TSubIssueOperations;
  storeType?: EIssuesStoreType;
  spacingLeft?: number;
}

export const SubIssuesListGroup = observer(function SubIssuesListGroup(props: TSubIssuesListGroupProps) {
  const {
    group,
    serviceType,
    canEdit,
    canReorder,
    parentIssueId,
    rootIssueId,
    projectId,
    workspaceSlug,
    handleIssueCrudState,
    subIssueOperations,
    workItemIds,
    storeType = EIssuesStoreType.PROJECT,
    spacingLeft = 0,
  } = props;

  const isAllIssues = group.id === ALL_ISSUES;

  // states
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(true);

  const handleReorder = useCallback(
    (sourceId: string, targetId: string, edge: "top" | "bottom") => {
      const orderedIds = moveWorkItemId(workItemIds, sourceId, targetId, edge);
      if (orderedIds.every((id, index) => id === workItemIds[index])) return;
      subIssueOperations.reorderSubIssues(workspaceSlug, projectId, parentIssueId, orderedIds);
    },
    [workItemIds, subIssueOperations, workspaceSlug, projectId, parentIssueId]
  );

  if (!workItemIds.length) return null;

  const items = workItemIds.map((workItemId, index) => (
    <SubIssuesListItem
      key={workItemId}
      canReorder={canReorder}
      previousIssueId={workItemIds[index - 1]}
      nextIssueId={workItemIds[index + 1]}
      onReorder={handleReorder}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      parentIssueId={parentIssueId}
      rootIssueId={rootIssueId}
      issueId={workItemId}
      canEdit={canEdit}
      handleIssueCrudState={handleIssueCrudState}
      subIssueOperations={subIssueOperations}
      issueServiceType={serviceType}
      spacingLeft={spacingLeft}
      storeType={storeType}
    />
  ));

  if (isAllIssues) return <>{items}</>;

  return (
    <Collapsible
      open={isCollapsibleOpen}
      onOpenChange={setIsCollapsibleOpen}
      icon={
        <div className="grid shrink-0 place-items-center overflow-hidden">
          {group.icon ?? <CircleDashed className="size-3.5" strokeWidth={2} />}
        </div>
      }
      trigger={
        <>
          <span className="text-13 font-medium text-primary">{group.name}</span>
          <span className="text-13 text-placeholder">{workItemIds.length}</span>
        </>
      }
    >
      {/* Cancels this nested Collapsible's own panel inset — the outer sub-work-items
          Collapsible (root.tsx) already contributes one; without this, grouped rows
          would sit inset twice. */}
      <div className="-mx-3">{items}</div>
    </Collapsible>
  );
});
