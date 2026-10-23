# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for work item templates and project templates."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    CustomProperty,
    Issue,
    IssueAssignee,
    IssueCustomPropertyValue,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    ProjectTemplate,
    State,
    User,
    WorkItemTemplate,
    WorkspaceMember,
)


def templates_url(slug, project_id, pk=None, apply=False):
    base = f"/api/workspaces/{slug}/projects/{project_id}/work-item-templates/"
    if pk:
        base = f"{base}{pk}/"
    return f"{base}apply/" if apply else base


def project_templates_url(slug, pk=None, apply=False):
    base = f"/api/workspaces/{slug}/project-templates/"
    if pk:
        base = f"{base}{pk}/"
    return f"{base}apply/" if apply else base


def _project(workspace, owner, name="Source"):
    project = Project.objects.create(
        name=name, identifier=f"{name[:2].upper()}{uuid4().hex[:3].upper()}", workspace=workspace, created_by=owner
    )
    ProjectMember.objects.create(project=project, member=owner, workspace=workspace, role=20)
    return project


def _member(workspace, project, role):
    user = User.objects.create(email=f"m-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.fixture
def project(db, workspace, create_user):
    project = _project(workspace, create_user)
    State.objects.create(name="Todo", group="unstarted", project=project, default=True, sequence=1)
    State.objects.create(name="Review", group="started", project=project, sequence=2)
    State.objects.create(name="Done", group="completed", project=project, sequence=3)
    return project


@pytest.fixture
def rich_issue(db, workspace, project, create_user):
    label = Label.objects.create(name="bug", color="#ff0000", project=project, workspace=workspace)
    prop = CustomProperty.objects.create(
        name="Severity",
        property_type="select",
        options=[{"id": "s1", "name": "High", "color": "#ff0000"}],
        project=project,
    )
    issue = Issue.objects.create(
        name="Incident report",
        description_html="<p>Steps</p>",
        priority="urgent",
        state=State.objects.get(project=project, name="Review"),
        project=project,
        workspace=workspace,
    )
    IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project)
    IssueLabel.objects.create(issue=issue, label=label, project=project)
    IssueCustomPropertyValue.objects.create(issue=issue, property=prop, value="s1", project=project)
    Issue.objects.create(name="Collect logs", parent=issue, project=project, workspace=workspace)
    Issue.objects.create(name="Write postmortem", parent=issue, project=project, workspace=workspace)
    return issue


@pytest.mark.contract
class TestWorkItemTemplates:
    def test_save_work_item_as_template(self, session_client, workspace, project, rich_issue, create_user):
        response = session_client.post(
            templates_url(workspace.slug, project.id),
            {"name": "Incident", "issue_id": str(rich_issue.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        template = response.data["template"]
        assert template["name"] == "Incident report"
        assert template["priority"] == "urgent"
        assert template["assignee_ids"] == [str(create_user.id)]
        assert [s["name"] for s in template["sub_issues"]] == ["Collect logs", "Write postmortem"]
        assert list(template["custom_properties"].values()) == ["s1"]

    def test_apply_adds_sub_work_items_and_custom_values(self, session_client, workspace, project, rich_issue):
        template_id = session_client.post(
            templates_url(workspace.slug, project.id),
            {"name": "Incident", "issue_id": str(rich_issue.id)},
            format="json",
        ).data["id"]
        new_issue = Issue.objects.create(name="New incident", project=project, workspace=workspace)

        response = session_client.post(
            templates_url(workspace.slug, project.id, template_id, apply=True),
            {"issue_id": str(new_issue.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert sorted(Issue.objects.filter(parent=new_issue).values_list("name", flat=True)) == [
            "Collect logs",
            "Write postmortem",
        ]
        assert IssueCustomPropertyValue.objects.get(issue=new_issue).value == "s1"

    def test_ids_from_other_projects_are_dropped(self, session_client, workspace, project, create_user):
        other = _project(workspace, create_user, name="Other")
        foreign_label = Label.objects.create(name="x", project=other, workspace=workspace)

        response = session_client.post(
            templates_url(workspace.slug, project.id),
            {"name": "T", "template": {"name": "Task", "label_ids": [str(foreign_label.id)], "priority": "bogus"}},
            format="json",
        )

        assert response.data["template"]["label_ids"] == []
        assert response.data["template"]["priority"] == "none"

    def test_member_cannot_delete_someone_elses_template(self, session_client, workspace, project):
        template_id = session_client.post(
            templates_url(workspace.slug, project.id), {"name": "Mine", "template": {"name": "x"}}, format="json"
        ).data["id"]
        _, member = _member(workspace, project, role=15)

        response = member.delete(templates_url(workspace.slug, project.id, template_id))

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert WorkItemTemplate.objects.filter(pk=template_id).exists()

    def test_guest_cannot_list_templates(self, workspace, project):
        _, guest = _member(workspace, project, role=5)
        assert guest.get(templates_url(workspace.slug, project.id)).status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestProjectTemplates:
    def test_snapshot_and_apply_to_a_new_project(self, session_client, workspace, project, rich_issue, create_user):
        session_client.post(
            templates_url(workspace.slug, project.id),
            {"name": "Incident", "issue_id": str(rich_issue.id)},
            format="json",
        )
        project.cycle_view = True
        project.save()

        created = session_client.post(
            project_templates_url(workspace.slug),
            {"name": "Support desk", "project_id": str(project.id), "include_work_items": True},
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        assert created.data["summary"]["work_item_templates"] == 1

        target = _project(workspace, create_user, name="Target")
        State.objects.create(name="Backlog", group="backlog", project=target, default=True)
        applied = session_client.post(
            project_templates_url(workspace.slug, created.data["id"], apply=True),
            {"project_id": str(target.id)},
            format="json",
        )

        assert applied.status_code == status.HTTP_204_NO_CONTENT
        target.refresh_from_db()
        assert target.cycle_view is True
        assert sorted(State.objects.filter(project=target).values_list("name", flat=True)) == ["Done", "Review", "Todo"]
        assert State.objects.get(project=target, default=True).name == "Todo"
        assert Label.objects.filter(project=target, name="bug").exists()
        severity = CustomProperty.objects.get(project=target, name="Severity")
        template = WorkItemTemplate.objects.get(project=target)
        assert template.template["label_ids"] == [str(Label.objects.get(project=target, name="bug").id)]
        incident = Issue.objects.get(project=target, name="Incident report")
        assert incident.state.name == "Review"
        assert IssueCustomPropertyValue.objects.get(issue=incident).property_id == severity.id
        assert Issue.objects.filter(project=target, parent=incident).count() == 2

    def test_only_project_admins_can_snapshot(self, workspace, project):
        _, member = _member(workspace, project, role=15)
        response = member.post(
            project_templates_url(workspace.slug), {"name": "Nope", "project_id": str(project.id)}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_apply_requires_admin_of_target_project(self, session_client, workspace, project, create_user):
        template = ProjectTemplate.objects.create(name="T", workspace=workspace, data={})
        target = _project(workspace, create_user, name="Target")
        member, client = _member(workspace, target, role=15)

        response = client.post(
            project_templates_url(workspace.slug, template.id, apply=True),
            {"project_id": str(target.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_states_are_kept_when_project_already_has_work(self, session_client, workspace, project, create_user):
        template = ProjectTemplate.objects.create(
            name="T", workspace=workspace, data={"states": [{"name": "Only", "group": "unstarted", "default": True}]}
        )
        Issue.objects.create(name="Existing", project=project, workspace=workspace)

        session_client.post(
            project_templates_url(workspace.slug, template.id, apply=True),
            {"project_id": str(project.id)},
            format="json",
        )

        names = set(State.objects.filter(project=project).values_list("name", flat=True))
        assert {"Todo", "Review", "Done", "Only"} <= names
