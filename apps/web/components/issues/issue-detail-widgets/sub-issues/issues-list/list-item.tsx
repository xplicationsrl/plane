/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import {
  ArrowDownOutline,
  ArrowUpOutline,
  ChevronRightOutline,
  CloseOutline,
  DeleteOutline,
  EditOutline,
  LinkOutline,
  MoreHorizontalOutline,
} from "@makeplane/propel/icons";
// plane imports
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import type { TIssue, TIssueServiceType, TSubIssueOperations } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
import { DropIndicator } from "@plane/blocks/common";
import { ControlLink } from "@plane/blocks/layout";
import { cn, generateWorkItemLink } from "@plane/utils";
// helpers
import { useSubIssueOperations } from "@/components/issues/issue-detail-widgets/sub-issues/helper";
import { WithDisplayPropertiesHOC } from "@/components/issues/issue-layouts/properties/with-display-properties-HOC";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// components
import { IssueIdentifier } from "@/components/issues/issue-detail/issue-identifier";
import { WorkItemCompletionCheckbox } from "@/components/issues/completion";
import { WorkItemColorSelect } from "@/components/issues/work-item-color";
// local components
import { SubIssuesListItemProperties } from "./properties";
import { SubIssuesListRoot } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  rootIssueId: string;
  spacingLeft: number;
  canEdit: boolean;
  canReorder: boolean;
  previousIssueId: string | undefined;
  nextIssueId: string | undefined;
  onReorder: (sourceId: string, targetId: string, edge: "top" | "bottom") => void;
  handleIssueCrudState: (
    key: "create" | "existing" | "update" | "delete",
    issueId: string,
    issue?: TIssue | null
  ) => void;
  subIssueOperations: TSubIssueOperations;
  issueId: string;
  issueServiceType?: TIssueServiceType;
  storeType?: EIssuesStoreType;
};

export const SubIssuesListItem = observer(function SubIssuesListItem(props: Props) {
  const {
    workspaceSlug,
    projectId,
    parentIssueId,
    rootIssueId,
    issueId,
    spacingLeft = 10,
    canEdit,
    canReorder,
    previousIssueId,
    nextIssueId,
    onReorder,
    handleIssueCrudState,
    subIssueOperations,
    issueServiceType = EIssueServiceType.ISSUES,
    storeType = EIssuesStoreType.PROJECT,
  } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
    subIssues: {
      filters: { getSubIssueFilters },
    },
  } = useIssueDetail(issueServiceType);
  const {
    subIssues: { subIssueHelpersByIssueId, setSubIssueHelpers },
  } = useIssueDetail();
  const { fetchSubIssues } = useSubIssueOperations(EIssueServiceType.ISSUES);
  const { toggleCreateIssueModal, toggleDeleteIssueModal } = useIssueDetail(issueServiceType);
  const project = useProject();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  const issue = getIssueById(issueId);
  // drag and drop
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [dropEdge, setDropEdge] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !canReorder) return;

    return combine(
      draggable({
        element,
        getInitialData: () => ({ type: "SUB_WORK_ITEM", id: issueId, parentIssueId }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        // Rows only move among their siblings: moving to another parent is a different action
        canDrop: ({ source }) =>
          source.data.type === "SUB_WORK_ITEM" &&
          source.data.parentIssueId === parentIssueId &&
          source.data.id !== issueId,
        getData: ({ input, element: target }) =>
          attachClosestEdge({ id: issueId }, { input, element: target, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setDropEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setDropEdge(null),
        onDrop: ({ source, self }) => {
          setDropEdge(null);
          const edge = extractClosestEdge(self.data);
          if (edge === "top" || edge === "bottom") onReorder(source.data.id as string, issueId, edge);
        },
      })
    );
  }, [canReorder, issueId, parentIssueId, onReorder]);

  // derived values
  const projectDetail = (issue && issue.project_id && project.getProjectById(issue.project_id)) || undefined;

  const subIssueHelpers = subIssueHelpersByIssueId(parentIssueId);
  const subIssueCount = issue?.sub_issues_count ?? 0;

  // derived values
  const subIssueFilters = getSubIssueFilters(parentIssueId);
  const displayProperties = subIssueFilters?.displayProperties ?? {};

  //
  const handleIssuePeekOverview = (workItem: TIssue) => handleRedirection(workspaceSlug, workItem, isMobile);

  if (!issue) return <></>;

  // check if current issue is the root issue
  const isCurrentIssueRoot = issueId === rootIssueId;

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId: issue?.id,
    projectIdentifier: projectDetail?.identifier,
    sequenceId: issue?.sequence_id,
  });

  return (
    <div key={issueId}>
      <ControlLink
        id={`issue-${issue.id}`}
        href={workItemLink}
        onClick={() => handleIssuePeekOverview(issue)}
        className="w-full cursor-pointer"
      >
        {issue && (
          <div
            ref={rowRef}
            className={cn(
              "group relative flex h-full min-h-11 w-full items-center py-1 pr-2 transition-all hover:bg-surface-2",
              { "opacity-50": isDragging }
            )}
            style={{ paddingLeft: `${spacingLeft}px` }}
          >
            <DropIndicator classNames="absolute top-0 left-0 z-[2]" isVisible={dropEdge === "top"} />
            <DropIndicator classNames="absolute bottom-0 left-0 z-[2]" isVisible={dropEdge === "bottom"} />
            <div className="flex size-5 flex-shrink-0 items-center justify-center">
              {/* disable the chevron when current issue is also the root issue*/}
              {subIssueCount > 0 && !isCurrentIssueRoot && (
                <>
                  {subIssueHelpers.preview_loader.includes(issue.id) ? (
                    <div className="flex h-full w-full cursor-not-allowed items-center justify-center rounded-xs bg-layer-1 transition-all">
                      <LinkOutline width={14} height={14} className="animate-spin" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={subIssueHelpers.issue_visibility.includes(issue.id)}
                      aria-label={issue.name}
                      className="flex h-full w-full cursor-pointer items-center justify-center text-placeholder hover:text-tertiary"
                      onKeyDown={(e) => {
                        // The row is a link activated by Enter/Space; keep those keys here.
                        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                      }}
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!subIssueHelpers.issue_visibility.includes(issueId)) {
                          setSubIssueHelpers(parentIssueId, "preview_loader", issueId);
                          await fetchSubIssues(workspaceSlug, projectId, issueId);
                          setSubIssueHelpers(parentIssueId, "preview_loader", issueId);
                        }
                        setSubIssueHelpers(parentIssueId, "issue_visibility", issueId);
                      }}
                    >
                      <ChevronRightOutline
                        className={cn("size-3.5 transition-all", {
                          "rotate-90": subIssueHelpers.issue_visibility.includes(issue.id),
                        })}
                      />
                    </button>
                  )}
                </>
              )}
            </div>

            <WorkItemCompletionCheckbox
              projectId={issue.project_id}
              stateId={issue.state_id}
              disabled={!canEdit}
              onChange={(stateId) =>
                issue.project_id
                  ? subIssueOperations.updateSubIssue(
                      workspaceSlug,
                      issue.project_id,
                      parentIssueId,
                      issue.id,
                      { state_id: stateId },
                      { ...issue }
                    )
                  : undefined
              }
            />

            <div className="ml-1.5 flex w-full cursor-pointer items-center gap-3 truncate">
              <WithDisplayPropertiesHOC displayProperties={displayProperties || {}} displayPropertyKey="key">
                <div className="flex-shrink-0">
                  {projectDetail && (
                    <IssueIdentifier
                      projectId={projectDetail.id}
                      issueTypeId={issue.type_id}
                      projectIdentifier={projectDetail.identifier}
                      issueSequenceId={issue.sequence_id}
                      size="xs"
                      variant="secondary"
                    />
                  )}
                </div>
              </WithDisplayPropertiesHOC>
              <WorkItemColorSelect
                value={issue.color_code}
                disabled={!canEdit}
                onChange={(color) =>
                  issue.project_id
                    ? subIssueOperations.updateSubIssue(
                        workspaceSlug,
                        issue.project_id,
                        parentIssueId,
                        issue.id,
                        { color_code: color },
                        { ...issue }
                      )
                    : undefined
                }
                emptyClassName="opacity-0 group-hover:opacity-100"
              />
              <Tooltip label={issue.name} layout="stacked" disabled={isMobile}>
                <span className="w-0 flex-1 truncate text-13 text-primary">{issue.name}</span>
              </Tooltip>
            </div>

            <div
              role="presentation"
              className="flex-shrink-0 text-13"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.stopPropagation();
              }}
            >
              <SubIssuesListItemProperties
                workspaceSlug={workspaceSlug}
                parentIssueId={parentIssueId}
                issueId={issueId}
                canEdit={canEdit}
                updateSubIssue={subIssueOperations.updateSubIssue}
                displayProperties={displayProperties}
                issue={issue}
              />
            </div>

            {/* The row's ControlLink activates on click and on Enter/Space, so the menu's own
                activation must not reach it. */}
            <div
              role="presentation"
              className="flex-shrink-0 text-13"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.stopPropagation();
              }}
            >
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
                  {/* The keyboard and touch route to what the row's drag does */}
                  {canReorder && previousIssueId && (
                    <MenuItem
                      icon={<Icon icon={ArrowUpOutline} />}
                      label={t("sub_work_item.move_up")}
                      onClick={() => onReorder(issueId, previousIssueId, "top")}
                    />
                  )}
                  {canReorder && nextIssueId && (
                    <MenuItem
                      icon={<Icon icon={ArrowDownOutline} />}
                      label={t("sub_work_item.move_down")}
                      onClick={() => onReorder(issueId, nextIssueId, "bottom")}
                    />
                  )}
                  {canEdit && (
                    <MenuItem
                      icon={<Icon icon={EditOutline} />}
                      label={t("issue.edit")}
                      onClick={() => {
                        handleIssueCrudState("update", parentIssueId, { ...issue });
                        toggleCreateIssueModal(true);
                      }}
                    />
                  )}
                  <MenuItem
                    icon={<Icon icon={LinkOutline} />}
                    label={t("issue.copy_link")}
                    onClick={() => {
                      subIssueOperations.copyLink(workItemLink);
                    }}
                  />
                  {canEdit && (
                    <MenuItem
                      icon={<Icon icon={CloseOutline} />}
                      label={
                        issueServiceType === EIssueServiceType.ISSUES
                          ? t("issue.remove.parent.label")
                          : t("issue.remove.label")
                      }
                      onClick={() => {
                        if (issue.project_id)
                          subIssueOperations.removeSubIssue(workspaceSlug, issue.project_id, parentIssueId, issue.id);
                      }}
                    />
                  )}
                  {canEdit && (
                    <MenuItem
                      icon={<Icon icon={DeleteOutline} />}
                      label={t("issue.delete.label")}
                      onClick={() => {
                        handleIssueCrudState("delete", parentIssueId, issue);
                        toggleDeleteIssueModal(issue.id);
                      }}
                    />
                  )}
                </MenuContent>
              </Menu>
            </div>
          </div>
        )}
      </ControlLink>

      {/* should not expand the current issue if it is also the root issue*/}
      {subIssueHelpers.issue_visibility.includes(issueId) &&
        issue.project_id &&
        subIssueCount > 0 &&
        !isCurrentIssueRoot && (
          <SubIssuesListRoot
            storeType={storeType}
            workspaceSlug={workspaceSlug}
            projectId={issue.project_id}
            parentIssueId={issue.id}
            rootIssueId={rootIssueId}
            spacingLeft={spacingLeft + 22}
            canEdit={canEdit}
            handleIssueCrudState={handleIssueCrudState}
            subIssueOperations={subIssueOperations}
          />
        )}
    </div>
  );
});
