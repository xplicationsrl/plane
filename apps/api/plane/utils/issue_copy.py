# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Server-side copying of work items (recurrences and templates build on it)."""

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueCustomPropertyValue,
    IssueLabel,
    ModuleIssue,
)

_UNSET = object()


def record_created_activity(issue, actor_id, comment="created the work item"):
    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor_id=actor_id,
        verb="created",
        comment=comment,
        epoch=timezone.now().timestamp(),
    )


def add_issue_relations(issue, *, actor_id, assignee_ids=(), label_ids=(), module_ids=()):
    """Attach assignees, labels and modules to a freshly created work item."""
    common = {"issue": issue, "project_id": issue.project_id, "workspace_id": issue.workspace_id}
    audit = {"created_by_id": actor_id, "updated_by_id": actor_id}
    IssueAssignee.objects.bulk_create(
        [IssueAssignee(assignee_id=user_id, **common, **audit) for user_id in dict.fromkeys(assignee_ids)],
        ignore_conflicts=True,
    )
    IssueLabel.objects.bulk_create(
        [IssueLabel(label_id=label_id, **common, **audit) for label_id in dict.fromkeys(label_ids)],
        ignore_conflicts=True,
    )
    ModuleIssue.objects.bulk_create(
        [ModuleIssue(module_id=module_id, **common, **audit) for module_id in dict.fromkeys(module_ids)],
        ignore_conflicts=True,
    )


def copy_issue(source, *, actor_id, start_date=_UNSET, target_date=_UNSET, parent_id=_UNSET, state_id=None):
    """A copy of ``source`` in the same project, in the project's default state unless given.

    Copies the content, priority, estimate, type, assignees, labels, modules and custom
    property values. Cycles are not copied: they are time-boxed.
    """
    issue = Issue(
        project_id=source.project_id,
        workspace_id=source.workspace_id,
        name=source.name,
        description_html=source.description_html,
        description_json=source.description_json,
        priority=source.priority,
        estimate_point_id=source.estimate_point_id,
        type_id=source.type_id,
        parent_id=source.parent_id if parent_id is _UNSET else parent_id,
        start_date=source.start_date if start_date is _UNSET else start_date,
        target_date=source.target_date if target_date is _UNSET else target_date,
        state_id=state_id,
        created_by_id=actor_id,
        updated_by_id=actor_id,
    )
    issue.save()

    add_issue_relations(
        issue,
        actor_id=actor_id,
        assignee_ids=IssueAssignee.objects.filter(issue=source).values_list("assignee_id", flat=True),
        label_ids=IssueLabel.objects.filter(issue=source).values_list("label_id", flat=True),
        module_ids=ModuleIssue.objects.filter(issue=source).values_list("module_id", flat=True),
    )
    IssueCustomPropertyValue.objects.bulk_create(
        [
            IssueCustomPropertyValue(
                issue=issue,
                property_id=row.property_id,
                value=row.value,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            for row in IssueCustomPropertyValue.objects.filter(issue=source)
        ]
    )
    record_created_activity(issue, actor_id)
    return issue
