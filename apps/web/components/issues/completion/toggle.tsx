/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { TickCircleFilled, TickCircleOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/elements/button";
import { Icon } from "@makeplane/propel/components/icon";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { useTranslation } from "@plane/i18n";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { useWorkItemCompletion } from "./use-work-item-completion";

type TCompletionProps = {
  projectId: string | null | undefined;
  stateId: string | null | undefined;
  disabled?: boolean;
  onChange: (stateId: string) => void | Promise<void>;
};

/** Round check used on list rows (subtasks). Clicks never reach the row's link. */
export const WorkItemCompletionCheckbox = observer(function WorkItemCompletionCheckbox(props: TCompletionProps) {
  const { projectId, stateId, disabled = false, onChange } = props;
  const { t } = useTranslation();
  const { isCompleted, getToggledStateId } = useWorkItemCompletion(projectId);
  const completed = isCompleted(stateId);
  const nextStateId = getToggledStateId(stateId);
  const label = completed ? t("issue.completion.reopen") : t("issue.completion.mark_complete");

  return (
    <Tooltip label={label} disabled={disabled || !nextStateId}>
      <button
        type="button"
        aria-pressed={completed}
        aria-label={label}
        disabled={disabled || !nextStateId}
        className={cn(
          "flex size-5 flex-shrink-0 items-center justify-center rounded-full transition-colors",
          completed ? "text-success-primary" : "text-placeholder hover:text-success-primary",
          { "cursor-not-allowed opacity-60": disabled || !nextStateId }
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (nextStateId) void onChange(nextStateId);
        }}
        onKeyDown={(e) => {
          // The row is a link activated by Enter/Space; keep those keys on the checkbox.
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
      >
        {completed ? <TickCircleFilled className="size-4" /> : <TickCircleOutline className="size-4" />}
      </button>
    </Tooltip>
  );
});

/** Labelled button for work item headers. */
export const WorkItemCompletionButton = observer(function WorkItemCompletionButton(props: TCompletionProps) {
  const { projectId, stateId, disabled = false, onChange } = props;
  const { t } = useTranslation();
  const { isCompleted, getToggledStateId } = useWorkItemCompletion(projectId);
  const completed = isCompleted(stateId);
  const nextStateId = getToggledStateId(stateId);

  if (!nextStateId) return null;

  return (
    <Button
      variant="secondary"
      size="md"
      stretch="auto"
      render={<button type="button" />}
      disabled={disabled}
      onClick={() => void onChange(nextStateId)}
    >
      <span className={cn("flex items-center gap-1.5", { "text-success-primary": completed })}>
        <Icon icon={completed ? TickCircleFilled : TickCircleOutline} />
        <span className="hidden sm:block">
          {completed ? t("issue.completion.completed") : t("issue.completion.mark_complete")}
        </span>
      </span>
    </Button>
  );
});

type THeaderCompletionProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

/** "Mark complete" for the work item detail and peek headers. */
export const WorkItemHeaderCompletion = observer(function WorkItemHeaderCompletion(props: THeaderCompletionProps) {
  const { workspaceSlug, projectId, issueId, disabled = false } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const issue = getIssueById(issueId);

  if (!issue || issue.archived_at) return null;

  return (
    <WorkItemCompletionButton
      projectId={projectId}
      stateId={issue.state_id}
      disabled={disabled}
      onChange={async (stateId) => {
        try {
          await updateIssue(workspaceSlug, projectId, issueId, { state_id: stateId });
        } catch {
          setToast({
            type: "error",
            title: t("common.error.label"),
            message: t("entity.update.failed", { entity: t("issue.label") }),
          });
        }
      }}
    />
  );
});
