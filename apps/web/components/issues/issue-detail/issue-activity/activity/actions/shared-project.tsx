/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ProjectsOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent } from "./";

type TIssueSharedProjectActivity = { activityId: string; ends: "top" | "bottom" | undefined };

export const IssueSharedProjectActivity = observer(function IssueSharedProjectActivity(
  props: TIssueSharedProjectActivity
) {
  const { activityId, ends } = props;
  const { t } = useTranslation();
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<ProjectsOutline width={14} height={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.verb === "created"
          ? t("shared_work_items.activity.added", { project: activity.new_value ?? "" })
          : t("shared_work_items.activity.removed", { project: activity.old_value ?? "" })}
      </>
    </IssueActivityBlockComponent>
  );
});
