/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TIssueIdentifierProps } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { IdentifierText, ProjectNameText } from "@/components/issues/issue-detail/identifier-text";

type TProjectNameProps = {
  projectId: string | null | undefined;
  fallback?: string;
};

export const ProjectName = observer(function ProjectName(props: TProjectNameProps) {
  const { projectId, fallback } = props;
  const { getPartialProjectById } = useProject();

  return <>{getPartialProjectById(projectId)?.name ?? fallback}</>;
});

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  // store hooks
  const { getProjectIdentifierById, getPartialProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // Determine if the component is using store data or not
  const isUsingStoreData = "issueId" in props;
  // derived values
  const issue = isUsingStoreData ? getIssueById(props.issueId) : null;
  const projectIdentifier = isUsingStoreData ? getProjectIdentifierById(projectId) : props.projectIdentifier;
  const issueSequenceId = isUsingStoreData ? issue?.sequence_id : props.issueSequenceId;
  const shouldRenderIssueID = displayProperties ? displayProperties.key : true;
  const identifier = `${projectIdentifier}-${issueSequenceId}`;
  const projectName = getPartialProjectById(projectId)?.name;

  if (!shouldRenderIssueID) return null;

  if (projectName) return <ProjectNameText projectName={projectName} variant={variant} size={size} />;

  return (
    <div className="flex shrink-0 items-center space-x-2">
      <IdentifierText
        identifier={identifier}
        enableClickToCopyIdentifier={enableClickToCopyIdentifier}
        variant={variant}
        size={size}
      />
    </div>
  );
});
