/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { ProjectsOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
// store hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
// components
import { IssueIdentifier } from "@/components/issues/issue-detail/issue-identifier";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId } = props;
  // router
  const { workspaceSlug } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const {
    issue: { getIssueById },
    setPeekIssue,
  } = useIssueDetail();
  const { getPartialProjectById } = useProject();
  // derived values
  const issue = getIssueById(issueId);

  if (!issue || !issue.project_id) return <></>;

  const identifier = (
    <IssueIdentifier issueId={issueId} projectId={issue.project_id} size="md" enableClickToCopyIdentifier />
  );

  // without a project name the identifier falls back to a click-to-copy button, which can't sit inside a link
  if (!getPartialProjectById(issue.project_id)?.name) return identifier;

  const projectHref = `/${workspaceSlug}/projects/${issue.project_id}/issues/`;
  // the peek overview store outlives the route, so close it or it reopens on top of the project page
  const handleProjectNavigation = () => setPeekIssue(undefined);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link href={projectHref} onClick={handleProjectNavigation} className="min-w-0 hover:underline">
        {identifier}
      </Link>
      <div className="shrink-0">
        <Button
          variant="secondary"
          size="sm"
          stretch="auto"
          icon={<Icon icon={ProjectsOutline} />}
          nativeButton={false}
          render={<Link href={projectHref} onClick={handleProjectNavigation} />}
          label={t("open_project")}
        />
      </div>
    </div>
  );
});
