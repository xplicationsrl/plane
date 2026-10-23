/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PropertiesOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent } from "./";

type TIssueCustomPropertyActivity = { activityId: string; ends: "top" | "bottom" | undefined };

/** A custom field change; the server stores the field name in `comment` and display values. */
export const IssueCustomPropertyActivity = observer(function IssueCustomPropertyActivity(
  props: TIssueCustomPropertyActivity
) {
  const { activityId, ends } = props;
  const { t } = useTranslation();
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const field = activity.comment ?? "";
  return (
    <IssueActivityBlockComponent
      icon={<PropertiesOutline width={14} height={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.new_value
          ? t("custom_properties.activity.set", { field, value: activity.new_value })
          : t("custom_properties.activity.cleared", { field })}
      </>
    </IssueActivityBlockComponent>
  );
});
