/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
// plane imports
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { StopCircleFilled } from "@makeplane/propel/icons";
import { formatTimerClock } from "@plane/blocks/utils";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useTimeEntry } from "@/hooks/store/use-time-entry";
// local imports
import { useElapsed } from "./issue-time-tracking";

type Props = {
  workspaceSlug: string;
};

/** Top bar pill for the user's running timer, wherever they are in the workspace. */
export const RunningTimerIndicator = observer(function RunningTimerIndicator(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { running, fetchRunning, stopTimer } = useTimeEntry();
  const elapsed = useElapsed(running?.started_at);

  useEffect(() => {
    if (workspaceSlug) void fetchRunning(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, fetchRunning]);

  // A timer started from a work item doesn't carry its details yet
  useEffect(() => {
    if (workspaceSlug && running && !running.issue_detail) void fetchRunning(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, running, fetchRunning]);

  if (!running) return null;

  const detail = running.issue_detail;
  const label = detail ? `${detail.project_identifier}-${detail.sequence_id}` : "";
  const href = detail
    ? generateWorkItemLink({
        workspaceSlug,
        projectId: running.project,
        issueId: running.issue,
        projectIdentifier: detail.project_identifier,
        sequenceId: detail.sequence_id,
      })
    : undefined;

  return (
    <div className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-subtle bg-layer-1 pr-1 pl-2 text-caption-sm-medium">
      <Tooltip label={detail?.name ?? t("time_log.timer.stop")} side="bottom">
        {href ? (
          <Link href={href} className="flex items-center gap-1.5 text-primary hover:underline">
            <span className="size-1.5 animate-pulse rounded-full bg-danger-primary" aria-hidden />
            <span className="font-mono tabular-nums">{formatTimerClock(elapsed)}</span>
            <span className="max-w-24 truncate text-tertiary">{label}</span>
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-danger-primary" aria-hidden />
            <span className="font-mono tabular-nums">{formatTimerClock(elapsed)}</span>
          </span>
        )}
      </Tooltip>
      <button
        type="button"
        aria-label={t("time_log.timer.stop")}
        onClick={() =>
          void stopTimer(workspaceSlug).catch(() =>
            setToast({ type: "error", title: t("toast.error"), message: t("time_log.timer.error") })
          )
        }
        className="grid size-5 place-items-center rounded-sm text-danger-primary hover:bg-layer-2"
      >
        <StopCircleFilled className="size-3.5" />
      </button>
    </div>
  );
});
