/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setToast } from "@plane/blocks/toast";
import type { TCustomPropertyValue } from "@plane/types";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useCustomProperty } from "@/hooks/store/use-custom-property";
// local imports
import { getCustomPropertyTypeIcon } from "./constants";
import { CustomPropertyValueInput } from "./property-value-input";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

/** The project's custom fields as sidebar rows of a work item; renders nothing when there are none. */
export const IssueCustomProperties = observer(function IssueCustomProperties(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const { getProjectProperties, getIssueValues, ensureProjectProperties, fetchIssueValues, updateIssueValue } =
    useCustomProperty();

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    void ensureProjectProperties(workspaceSlug, projectId).catch(() => undefined);
  }, [workspaceSlug, projectId, ensureProjectProperties]);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !issueId) return;
    void fetchIssueValues(workspaceSlug, projectId, issueId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, issueId]);

  const properties = getProjectProperties(projectId);
  const values = getIssueValues(issueId) ?? {};

  if (properties.length === 0) return null;

  const handleChange = async (propertyId: string, value: TCustomPropertyValue) => {
    try {
      await updateIssueValue(workspaceSlug, projectId, issueId, propertyId, value);
    } catch (error) {
      const message = (error as Record<string, string[]> | undefined)?.[propertyId]?.[0];
      setToast({
        type: "error",
        title: t("toast.error"),
        message: message ?? t("custom_properties.value.update_error"),
      });
    }
  };

  return (
    <>
      {properties.map((property) => (
        <SidebarPropertyListItem
          key={property.id}
          icon={getCustomPropertyTypeIcon(property.property_type)}
          label={property.name}
        >
          <CustomPropertyValueInput
            property={property}
            projectId={projectId}
            value={values[property.id]}
            disabled={disabled}
            onChange={(value) => void handleChange(property.id, value)}
          />
        </SidebarPropertyListItem>
      ))}
    </>
  );
});
