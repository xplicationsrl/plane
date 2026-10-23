/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// hooks
import { useCustomProperty } from "@/hooks/store/use-custom-property";
// local imports
import { getCustomPropertyTypeIcon } from "./constants";
import { CustomPropertyValueInput } from "./property-value-input";

/**
 * Custom properties as spreadsheet columns. Only on project-level layouts: a workspace view
 * mixes projects whose properties differ.
 */
const useProjectProperties = () => {
  const { workspaceSlug, projectId } = useParams();
  const { fetchedProjectIds, getProjectProperties, fetchProjectProperties } = useCustomProperty();
  const slug = workspaceSlug?.toString();
  const project = projectId?.toString();

  useEffect(() => {
    if (slug && project && !fetchedProjectIds[project])
      void fetchProjectProperties(slug, project).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, project]);

  return { workspaceSlug: slug, projectId: project, properties: getProjectProperties(project) };
};

export const CustomPropertyHeaderColumns = observer(function CustomPropertyHeaderColumns() {
  const { properties } = useProjectProperties();
  return (
    <>
      {properties.map((property) => {
        const TypeIcon = getCustomPropertyTypeIcon(property.property_type);
        return (
          <th
            key={property.id}
            className="h-11 min-w-36 items-center border border-t-0 border-b-0 border-subtle bg-layer-1 px-4 py-1 text-left text-13 font-medium"
          >
            <span className="flex items-center gap-1.5">
              <TypeIcon className="size-3.5 flex-shrink-0 text-tertiary" />
              <span className="max-w-40 truncate" title={property.name}>
                {property.name}
              </span>
            </span>
          </th>
        );
      })}
    </>
  );
});

type TCellsProps = {
  issue: TIssue;
  disabled: boolean;
};

export const CustomPropertyCells = observer(function CustomPropertyCells(props: TCellsProps) {
  const { issue, disabled } = props;
  const { t } = useTranslation();
  const { workspaceSlug, projectId, properties } = useProjectProperties();
  const { getIssueValues, updateIssueValue } = useCustomProperty();

  if (!workspaceSlug || !projectId || issue.project_id !== projectId) return null;
  const values = getIssueValues(issue.id) ?? {};

  return (
    <>
      {properties.map((property) => (
        <td
          key={property.id}
          className="h-11 max-w-60 min-w-36 border-r-[1px] border-subtle px-2 text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
        >
          <CustomPropertyValueInput
            property={property}
            projectId={projectId}
            value={values[property.id]}
            disabled={disabled}
            onChange={(value) =>
              void updateIssueValue(workspaceSlug, projectId, issue.id, property.id, value).catch(() =>
                setToast({ type: "error", title: t("toast.error"), message: t("custom_properties.value.update_error") })
              )
            }
          />
        </td>
      ))}
    </>
  );
});

/** Loads custom property values for the rows on screen. */
export const useSpreadsheetCustomPropertyValues = (issueIds: string[]) => {
  const { workspaceSlug, projectId, properties } = useProjectProperties();
  const { fetchBulkIssueValues } = useCustomProperty();
  const key = issueIds.join(",");

  useEffect(() => {
    if (!workspaceSlug || !projectId || properties.length === 0 || issueIds.length === 0) return;
    void fetchBulkIssueValues(workspaceSlug, projectId, issueIds).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, properties.length, key]);
};
