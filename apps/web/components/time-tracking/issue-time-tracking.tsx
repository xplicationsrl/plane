/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Avatar } from "@makeplane/propel/components/avatar";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { DeleteOutline, PlayCircleOutline, StopCircleFilled } from "@makeplane/propel/icons";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { DateSelect } from "@plane/blocks/property-select";
import { formatDuration, formatTimerClock, parseDuration } from "@plane/blocks/utils";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import { getFileURL, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// hooks
import { useTimeEntry } from "@/hooks/store/use-time-entry";
import { useUser, useUserPermissions, useUserProfile } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

/** Seconds since `startedAt`, ticking every second while mounted. */
export const useElapsed = (startedAt: string | null | undefined) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0;
};

const TimeLogForm = observer(function TimeLogForm(props: Omit<Props, "disabled">) {
  const { workspaceSlug, projectId, issueId } = props;
  const { t } = useTranslation();
  const { logTime } = useTimeEntry();
  const { data: userProfile } = useUserProfile();
  const [duration, setDuration] = useState("");
  const [loggedOn, setLoggedOn] = useState<Date>(new Date());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const seconds = parseDuration(duration);
    if (!seconds) {
      setError(t("time_log.form.invalid_duration"));
      return;
    }
    setIsSubmitting(true);
    try {
      await logTime(workspaceSlug, projectId, issueId, {
        duration_seconds: seconds,
        logged_on: renderFormattedPayloadDate(loggedOn) ?? undefined,
        description: description.trim(),
      });
      setDuration("");
      setDescription("");
      setError(null);
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("time_log.form.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "h-8 w-full rounded-md border-[0.5px] border-subtle bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus:border-strong";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          value={duration}
          onChange={(e) => {
            setDuration(e.target.value);
            setError(null);
          }}
          placeholder={t("time_log.form.duration_placeholder")}
          aria-label={t("time_log.form.duration")}
          className={inputClass}
        />
        <div className="w-36 flex-shrink-0">
          <DateSelect
            value={loggedOn}
            onChange={(date) => setLoggedOn(date ?? new Date())}
            maxDate={new Date()}
            weekStartsOn={userProfile?.start_of_the_week}
            variant="select-md"
          />
        </div>
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("time_log.form.note_placeholder")}
        aria-label={t("time_log.form.note")}
        maxLength={1000}
        className={inputClass}
      />
      {error && <p className="text-caption-sm-regular text-danger-primary">{error}</p>}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          stretch="auto"
          loading={isSubmitting}
          label={t("time_log.form.submit")}
        />
      </div>
    </form>
  );
});

export const IssueTimeTracking = observer(function IssueTimeTracking(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const { summaries, running, fetchSummary, fetchRunning, startTimer, stopTimer, deleteEntry } = useTimeEntry();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (workspaceSlug && projectId && issueId)
      void fetchSummary(workspaceSlug, projectId, issueId).catch(() => undefined);
  }, [workspaceSlug, projectId, issueId, fetchSummary]);

  useEffect(() => {
    if (workspaceSlug) void fetchRunning(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, fetchRunning]);

  const summary = summaries[issueId];
  const isRunningHere = running?.issue === issueId;
  const elapsed = useElapsed(isRunningHere ? running?.started_at : null);
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const loggedEntries = (summary?.entries ?? []).filter((entry) => !entry.is_running);

  const toggleTimer = async () => {
    setIsBusy(true);
    try {
      if (isRunningHere) await stopTimer(workspaceSlug);
      else {
        const stopped = await startTimer(workspaceSlug, projectId, issueId);
        if (stopped)
          setToast({
            type: "info",
            title: t("time_log.timer.switched_title"),
            message: t("time_log.timer.switched_message", { duration: formatDuration(stopped.duration_seconds) }),
          });
      }
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("time_log.timer.error") });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex w-full items-center gap-1">
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-7.5 min-w-0 grow items-center rounded-sm px-2 text-left text-body-xs-regular hover:bg-layer-transparent-hover"
            />
          }
        >
          {summary && summary.total_seconds > 0 ? (
            <span className="text-primary">{formatDuration(summary.total_seconds)}</span>
          ) : (
            <span className="text-placeholder">{t("time_log.none")}</span>
          )}
        </PopoverTrigger>
        <PopoverContent variant="rich" side="bottom" align="start">
          <div className="flex w-80 flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm-medium text-primary">{t("time_log.title")}</span>
              <span className="text-body-xs-regular text-tertiary">
                {t("time_log.total", { duration: formatDuration(summary?.total_seconds ?? 0) })}
              </span>
            </div>
            {!disabled && <TimeLogForm workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} />}
            {loggedEntries.length > 0 && (
              <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto border-t border-subtle pt-2">
                {loggedEntries.map((entry) => {
                  const canDelete = !disabled && (entry.user === currentUser?.id || isAdmin);
                  return (
                    <li key={entry.id} className="group flex items-start gap-2 rounded-sm px-1 py-1 hover:bg-layer-1">
                      <Avatar
                        size="2xs"
                        alt={entry.user_detail?.display_name}
                        fallback={entry.user_detail?.display_name?.[0]?.toUpperCase()}
                        src={getFileURL(entry.user_detail?.avatar_url ?? "")}
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2 text-body-xs-regular">
                          <span className="font-medium text-primary">{formatDuration(entry.duration_seconds)}</span>
                          <span className="truncate text-tertiary">
                            {entry.user_detail?.display_name} · {renderFormattedDate(entry.logged_on)}
                          </span>
                        </span>
                        {entry.description && (
                          <span className="text-caption-sm-regular break-words text-secondary">
                            {entry.description}
                          </span>
                        )}
                      </div>
                      {canDelete && (
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={t("common.delete")}
                          icon={<Icon icon={DeleteOutline} />}
                          onClick={() =>
                            void deleteEntry(workspaceSlug, projectId, issueId, entry.id).catch(() =>
                              setToast({ type: "error", title: t("toast.error"), message: t("time_log.form.error") })
                            )
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {!disabled && (
        <Tooltip label={isRunningHere ? t("time_log.timer.stop") : t("time_log.timer.start")}>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void toggleTimer()}
            aria-label={isRunningHere ? t("time_log.timer.stop") : t("time_log.timer.start")}
            className="flex h-7.5 flex-shrink-0 items-center gap-1.5 rounded-sm px-2 text-body-xs-regular text-tertiary hover:bg-layer-transparent-hover hover:text-primary disabled:opacity-60"
          >
            {isRunningHere ? (
              <>
                <StopCircleFilled className="size-4 text-danger-primary" />
                <span className="font-mono text-primary tabular-nums">{formatTimerClock(elapsed)}</span>
              </>
            ) : (
              <PlayCircleOutline className="size-4" />
            )}
          </button>
        </Tooltip>
      )}
    </div>
  );
});
