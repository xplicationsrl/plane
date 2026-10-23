/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { DateSelect } from "@plane/blocks/property-select";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIssueRecurrence, TIssueRecurrencePayload, TRecurrenceFrequency } from "@plane/types";
import { cn, getDate, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// hooks
import { useRecurrence } from "@/hooks/store/use-recurrence";
import { useUserProfile } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

const FREQUENCIES: TRecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Plane locale codes that aren't BCP 47 tags. */
const INTL_LOCALE: Record<string, string> = { ua: "uk", "ka-ge": "ka" };

/** Short weekday names (0 = Monday) in the UI language. */
const useWeekdayNames = () => {
  const { currentLocale } = useTranslation();
  const formatter = new Intl.DateTimeFormat(INTL_LOCALE[currentLocale] ?? currentLocale, { weekday: "short" });
  // 2024-01-01 was a Monday
  return WEEKDAYS.map((day) => formatter.format(new Date(2024, 0, 1 + day)));
};

/** "Every 2 weeks on Mon, Thu until Dec 31" */
export const useRecurrenceSummary = () => {
  const { t } = useTranslation();
  const weekdayNames = useWeekdayNames();
  return (rule: Pick<TIssueRecurrence, "frequency" | "interval" | "weekdays" | "ends_on">) => {
    let summary = t(`recurrence.summary.${rule.frequency}`, { count: rule.interval });
    if (rule.frequency === "weekly" && rule.weekdays.length > 0)
      summary = t("recurrence.summary.on_days", {
        summary,
        days: rule.weekdays.map((day) => weekdayNames[day]).join(", "),
      });
    if (rule.ends_on)
      summary = t("recurrence.summary.until", { summary, date: renderFormattedDate(rule.ends_on) ?? "" });
    return summary;
  };
};

const RecurrenceEditor = observer(function RecurrenceEditor(
  props: Omit<Props, "disabled"> & { recurrence: TIssueRecurrence | null; onDone: () => void }
) {
  const { workspaceSlug, projectId, issueId, recurrence, onDone } = props;
  const { t } = useTranslation();
  const { data: userProfile } = useUserProfile();
  const { saveRecurrence, removeRecurrence } = useRecurrence();
  const weekdayNames = useWeekdayNames();
  const summarize = useRecurrenceSummary();
  // states
  const [draft, setDraft] = useState<TIssueRecurrencePayload>({
    frequency: recurrence?.frequency ?? "weekly",
    interval: recurrence?.interval ?? 1,
    weekdays: recurrence?.weekdays ?? [],
    ends_on: recurrence?.ends_on ?? null,
  });
  const [isSaving, setIsSaving] = useState(false);

  const frequencyOptions = FREQUENCIES.map((key) => ({
    key,
    label: t(`recurrence.frequency.${key}`, { count: draft.interval }),
  }));

  const run = async (action: () => Promise<void>) => {
    setIsSaving(true);
    try {
      await action();
      onDone();
    } catch {
      setToast({ type: "error", title: t("toast.error"), message: t("recurrence.error") });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWeekday = (day: number) =>
    setDraft((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : WEEKDAYS.filter((d) => d === day || prev.weekdays.includes(d)),
    }));

  return (
    <div className="flex w-72 flex-col gap-3">
      <span className="text-body-sm-medium text-primary">{t("recurrence.title")}</span>

      <div className="flex items-center gap-2">
        <span className="text-body-xs-regular text-secondary">{t("recurrence.every")}</span>
        <input
          type="number"
          min={1}
          max={365}
          value={draft.interval}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) }))
          }
          aria-label={t("recurrence.interval")}
          className="h-8 w-16 rounded-md border-[0.5px] border-subtle bg-transparent px-2 text-body-xs-regular text-primary outline-none focus:border-strong"
        />
        <div className="grow">
          <Select<(typeof frequencyOptions)[number]>
            getValues={() => frequencyOptions}
            value={frequencyOptions.find((option) => option.key === draft.frequency) ?? null}
            onChange={(key) => setDraft((prev) => ({ ...prev, frequency: key as TRecurrenceFrequency }))}
            showSearch={false}
            pinSelected={false}
            getOptionValue={(option) => option.key}
            getOptionLabel={(option) => option.label}
          >
            <Select.Trigger<(typeof frequencyOptions)[number]> variant="select-md">
              {(options) => <span className="min-w-0 grow truncate text-left">{options[0]?.label}</span>}
            </Select.Trigger>
          </Select>
        </div>
      </div>

      {draft.frequency === "weekly" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-body-xs-regular text-secondary">{t("recurrence.on_days")}</span>
          <div className="flex gap-1">
            {WEEKDAYS.map((day) => {
              const active = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleWeekday(day)}
                  className={cn(
                    "h-7 flex-1 rounded-md border-[0.5px] text-caption-sm-medium transition-colors",
                    active
                      ? "border-accent-strong bg-accent-primary text-on-color"
                      : "border-subtle text-secondary hover:bg-layer-1"
                  )}
                >
                  {weekdayNames[day]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-body-xs-regular text-secondary">{t("recurrence.ends")}</span>
        <DateSelect
          value={draft.ends_on ? (getDate(draft.ends_on) ?? null) : null}
          onChange={(date) =>
            setDraft((prev) => ({ ...prev, ends_on: date ? (renderFormattedPayloadDate(date) ?? null) : null }))
          }
          placeholder={t("recurrence.never")}
          minDate={new Date()}
          clearable
          weekStartsOn={userProfile?.start_of_the_week}
          variant="select-md"
        />
      </div>

      <p className="text-caption-sm-regular text-tertiary">
        {summarize(draft)}. {t("recurrence.explainer")}
      </p>

      <div className="flex items-center justify-between gap-2">
        {recurrence ? (
          <Button
            variant="ghost"
            size="sm"
            stretch="auto"
            disabled={isSaving}
            label={t("recurrence.stop")}
            onClick={() => void run(() => removeRecurrence(workspaceSlug, projectId, issueId))}
          />
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="sm"
          stretch="auto"
          loading={isSaving}
          label={t("save")}
          onClick={() => void run(() => saveRecurrence(workspaceSlug, projectId, issueId, draft))}
        />
      </div>
    </div>
  );
});

/** Sidebar control: shows how the work item repeats and opens the rule editor. */
export const IssueRecurrence = observer(function IssueRecurrence(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const { recurrences, fetchRecurrence } = useRecurrence();
  const summarize = useRecurrenceSummary();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (workspaceSlug && projectId && issueId)
      void fetchRecurrence(workspaceSlug, projectId, issueId).catch(() => undefined);
  }, [workspaceSlug, projectId, issueId, fetchRecurrence]);

  const recurrence = recurrences[issueId] ?? null;
  const label = recurrence?.is_active ? summarize(recurrence) : t("recurrence.none");

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className="flex h-7.5 w-full min-w-0 items-center rounded-sm px-2 text-left text-body-xs-regular hover:bg-layer-transparent-hover disabled:cursor-not-allowed"
          />
        }
      >
        <span className={cn("truncate", recurrence?.is_active ? "text-primary" : "text-placeholder")} title={label}>
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent variant="rich" side="bottom" align="start">
        {isOpen && (
          <RecurrenceEditor
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            recurrence={recurrence}
            onDone={() => setIsOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
});
