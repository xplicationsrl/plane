/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { useTranslation } from "@plane/i18n";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import type { TSharedWorkItem } from "@plane/types";
import { cn, generateWorkItemLink, renderFormattedDate } from "@plane/utils";
// hooks
import { useSharedWorkItem } from "@/hooks/store/use-shared-work-item";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

function SharedRow(props: { item: TSharedWorkItem; workspaceSlug: string; onOpen: (href: string) => void }) {
  const { item, workspaceSlug, onOpen } = props;
  const { t } = useTranslation();
  const href = generateWorkItemLink({
    workspaceSlug,
    projectId: item.project_id,
    issueId: item.id,
    projectIdentifier: item.project_identifier,
    sequenceId: item.sequence_id,
  });
  const body = (
    <>
      <span
        className="size-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: item.state?.color ?? "transparent" }}
        title={item.state?.name}
      />
      <span className="flex-shrink-0 text-caption-sm-medium text-tertiary">
        {item.project_identifier}-{item.sequence_id}
      </span>
      <span className="min-w-0 flex-1 truncate text-body-xs-regular text-primary">{item.name}</span>
      {item.target_date && (
        <span className="flex-shrink-0 text-caption-sm-regular text-tertiary">
          {renderFormattedDate(item.target_date)}
        </span>
      )}
      {item.assignee_ids.length > 0 && <ButtonAvatars showTooltip userIds={item.assignee_ids} />}
    </>
  );
  const className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left";
  return item.can_open ? (
    <button type="button" className={cn(className, "hover:bg-layer-1")} onClick={() => onOpen(href)}>
      {body}
    </button>
  ) : (
    <div className={cn(className, "cursor-default opacity-80")} title={t("shared_work_items.no_access")}>
      {body}
    </div>
  );
}

/** Header chip on a project's work items listing work items shared from other projects. */
export const ProjectSharedWorkItemsButton = observer(function ProjectSharedWorkItemsButton(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { sharedWorkItems, fetchSharedWorkItems } = useSharedWorkItem();

  useEffect(() => {
    if (workspaceSlug && projectId) void fetchSharedWorkItems(workspaceSlug, projectId).catch(() => undefined);
  }, [workspaceSlug, projectId, fetchSharedWorkItems]);

  const items = sharedWorkItems[projectId] ?? [];
  if (items.length === 0) return null;

  // Group by home project so the list reads like "from Website: …"
  const groups = items.reduce<Record<string, TSharedWorkItem[]>>((acc, item) => {
    (acc[item.project_name] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-sm bg-layer-1 px-2.5 py-1 text-11 font-medium text-secondary hover:bg-layer-2"
          />
        }
      >
        {t("shared_work_items.button", { count: items.length })}
      </PopoverTrigger>
      <PopoverContent variant="rich" side="bottom" align="start">
        <div className="flex max-h-96 w-[28rem] max-w-[90vw] flex-col gap-3 overflow-y-auto">
          <div>
            <p className="text-body-sm-medium text-primary">{t("shared_work_items.title")}</p>
            <p className="text-caption-sm-regular text-tertiary">{t("shared_work_items.description")}</p>
          </div>
          {Object.entries(groups).map(([projectName, groupItems]) => (
            <div key={projectName} className="flex flex-col gap-0.5">
              <p className="px-2 text-caption-sm-medium text-tertiary">
                {t("shared_work_items.from_project", { project: projectName })}
              </p>
              {groupItems.map((item) => (
                <SharedRow
                  key={item.id}
                  item={item}
                  workspaceSlug={workspaceSlug}
                  onOpen={(href) => router.push(href)}
                />
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
