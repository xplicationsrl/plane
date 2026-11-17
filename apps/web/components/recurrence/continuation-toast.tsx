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
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useRecurrence } from "@/hooks/store/use-recurrence";

/**
 * Announces the next occurrence of a recurring work item once completing it has created one.
 * Mounted once in the top bar, so it works wherever the completion happened.
 */
export const RecurrenceContinuationToast = observer(function RecurrenceContinuationToast() {
  const { t } = useTranslation();
  const { lastContinuation } = useRecurrence();

  useEffect(() => {
    if (!lastContinuation) return;
    const { workspaceSlug, next } = lastContinuation;
    const identifier = `${next.project_identifier}-${next.sequence_id}`;
    setToast({
      type: "success",
      title: t("recurrence.next_created.title"),
      message: t("recurrence.next_created.message", { identifier, name: next.name }),
      actionItems: [
        {
          label: t("recurrence.next_created.open"),
          href: generateWorkItemLink({
            workspaceSlug,
            projectId: next.project_id,
            issueId: next.id,
            projectIdentifier: next.project_identifier,
            sequenceId: next.sequence_id,
          }),
          primary: true,
        },
      ],
    });
    // A new event object is stored for every continuation (observable.ref), so this fires once each
  }, [lastContinuation, t]);

  return null;
});
