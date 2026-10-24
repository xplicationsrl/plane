/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { AddOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { setToast } from "@plane/blocks/toast";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";

type Props = {
  workspaceSlug: string;
  projectId: string;
  parentIssueId: string;
  issueServiceType?: TIssueServiceType;
};

/**
 * Inline "add sub-work item" row: type a title, press Enter, keep typing the next one.
 * Escape (or leaving the field empty) closes it.
 */
export const SubIssueQuickAdd = observer(function SubIssueQuickAdd(props: Props) {
  const { workspaceSlug, projectId, parentIssueId, issueServiceType = EIssueServiceType.ISSUES } = props;
  const { t } = useTranslation();
  // store hooks
  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const issueDetail = useIssueDetail(issueServiceType);
  const { createSubIssues, subIssueQuickAddParentId, setSubIssueQuickAddParentId } = issueDetail;
  // states
  const [name, setName] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  // derived values
  const isOpen = subIssueQuickAddParentId === parentIssueId;

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Close when the user navigates to another work item; read the store at cleanup time,
  // not the value captured when this effect ran
  useEffect(
    () => () => {
      if (issueDetail.subIssueQuickAddParentId === parentIssueId) setSubIssueQuickAddParentId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parentIssueId]
  );

  const close = () => {
    setName("");
    setSubIssueQuickAddParentId(null);
  };

  const submit = async () => {
    const title = name.trim();
    if (!title) return;
    // Clear right away so the next title can be typed while this one saves
    setName("");
    setPendingCount((count) => count + 1);
    try {
      const created = await issues.createIssue(workspaceSlug, projectId, {
        name: title,
        project_id: projectId,
        parent_id: parentIssueId,
      });
      if (created?.id) await createSubIssues(workspaceSlug, projectId, parentIssueId, [created.id]);
    } catch {
      setName((current) => current || title);
      setToast({
        type: "error",
        title: t("toast.error"),
        message: t("sub_work_item.quick_add.error"),
      });
    } finally {
      setPendingCount((count) => count - 1);
    }
  };

  if (!isOpen)
    return (
      <button
        type="button"
        className="flex min-h-9 w-full items-center gap-2 rounded-sm px-2 text-13 text-placeholder hover:bg-surface-2 hover:text-secondary"
        onClick={() => setSubIssueQuickAddParentId(parentIssueId)}
      >
        <AddOutline className="size-3.5" />
        {t("sub_work_item.quick_add.button")}
      </button>
    );

  return (
    <div className="flex min-h-9 w-full items-center gap-2 px-2">
      <AddOutline className="size-3.5 flex-shrink-0 text-placeholder" />
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        onBlur={() => {
          if (!name.trim()) close();
        }}
        placeholder={t("sub_work_item.quick_add.placeholder")}
        aria-label={t("sub_work_item.quick_add.placeholder")}
        className="w-full bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
        maxLength={255}
      />
      {pendingCount > 0 && (
        <span className="flex-shrink-0 text-caption-sm-regular text-placeholder">{t("common.saving")}</span>
      )}
    </div>
  );
});
