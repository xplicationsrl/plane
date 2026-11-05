# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from plane.db.models import (
    CustomProperty,
    Issue,
    IssueCustomPropertyValue,
    IssueLabel,
    IssueRelation,
    Label,
    Page,
    Project,
    ProjectIdentifier,
    ProjectMember,
    ProjectPage,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


@pytest.fixture
def setup(db, workspace, create_user):
    target = Workspace.objects.create(name="SES-uri", owner=create_user, slug="ses-uri")
    WorkspaceMember.objects.create(workspace=target, member=create_user, role=20)

    other_user = User.objects.create(email="member@example.com", username="member", first_name="Member")
    WorkspaceMember.objects.create(workspace=workspace, member=other_user, role=15)

    moved = Project.objects.create(name="my-project.v2", identifier="MOVED", workspace=workspace)
    stays = Project.objects.create(name="Stays", identifier="STAYS", workspace=workspace)
    ProjectIdentifier.objects.create(name="MOVED", project=moved, workspace=workspace)
    ProjectMember.objects.create(project=moved, member=create_user, role=20)
    ProjectMember.objects.create(project=moved, member=other_user, role=15)

    state = State.objects.create(name="Todo", project=moved, workspace=workspace)
    issue = Issue.objects.create(name="Task", project=moved, workspace=workspace, state=state)
    label = Label.objects.create(name="Bug", project=moved, workspace=workspace)
    IssueLabel.objects.create(issue=issue, label=label, project=moved, workspace=workspace)
    prop = CustomProperty.objects.create(name="Client", property_type="text", project=moved, workspace=workspace)
    IssueCustomPropertyValue.objects.create(issue=issue, property=prop, value="x", project=moved, workspace=workspace)

    page = Page.objects.create(name="Notes", workspace=workspace, owned_by=create_user)
    ProjectPage.objects.create(project=moved, page=page, workspace=workspace)

    stays_issue = Issue.objects.create(name="Other", project=stays, workspace=workspace)

    return {
        "source": workspace,
        "target": target,
        "moved": moved,
        "stays": stays,
        "issue": issue,
        "page": page,
        "other_user": other_user,
        "stays_issue": stays_issue,
    }


def _move(*extra):
    call_command(
        "move_projects_to_workspace", "--source=test-workspace", "--target=ses-uri", "--projects=MOVED", *extra
    )


@pytest.mark.unit
class TestMoveProjectsToWorkspace:
    def test_dry_run_changes_nothing(self, setup):
        _move()
        setup["moved"].refresh_from_db()
        assert setup["moved"].workspace_id == setup["source"].id
        assert not WorkspaceMember.objects.filter(workspace=setup["target"], member=setup["other_user"]).exists()

    def test_commit_moves_project_and_related_rows(self, setup):
        _move("--commit")
        source, target, moved = setup["source"], setup["target"], setup["moved"]

        moved.refresh_from_db()
        assert moved.workspace_id == target.id
        assert ProjectIdentifier.objects.get(project=moved).workspace_id == target.id
        for model in (State, Issue, Label, IssueLabel, CustomProperty, IssueCustomPropertyValue, ProjectMember):
            assert not model.objects.filter(project=moved, workspace=source).exists(), model.__name__
            assert model.objects.filter(project=moved, workspace=target).exists(), model.__name__

        setup["page"].refresh_from_db()
        assert setup["page"].workspace_id == target.id
        assert ProjectPage.objects.get(project=moved).workspace_id == target.id

        member = WorkspaceMember.objects.get(workspace=target, member=setup["other_user"])
        assert member.is_active and member.role == 15

    def test_other_projects_stay(self, setup):
        _move("--commit")
        setup["stays"].refresh_from_db()
        setup["stays_issue"].refresh_from_db()
        assert setup["stays"].workspace_id == setup["source"].id
        assert setup["stays_issue"].workspace_id == setup["source"].id

    def test_unknown_identifier_fails(self, setup):
        with pytest.raises(CommandError, match="NOPE"):
            call_command("move_projects_to_workspace", "--source=test-workspace", "--target=ses-uri", "--projects=NOPE")

    def test_page_shared_with_staying_project_blocks(self, setup):
        ProjectPage.objects.create(project=setup["stays"], page=setup["page"], workspace=setup["source"])
        with pytest.raises(CommandError, match="Notes"):
            _move("--commit")
        setup["moved"].refresh_from_db()
        assert setup["moved"].workspace_id == setup["source"].id

    def test_workspace_label_blocks(self, setup):
        workspace_label = Label.objects.create(name="Global", workspace=setup["source"])
        IssueLabel.objects.create(
            issue=setup["issue"], label=workspace_label, project=setup["moved"], workspace=setup["source"]
        )
        with pytest.raises(CommandError, match="Global"):
            _move("--commit")

    def test_name_clash_in_target_blocks(self, setup):
        Project.objects.create(name="my-project.v2", identifier="OTHER", workspace=setup["target"])
        with pytest.raises(CommandError, match="my-project.v2"):
            _move("--commit")


@pytest.mark.django_db
class TestMoveProjectsSafety:
    def test_trashed_project_with_the_same_identifier_stays(self, setup):
        trashed = Project.objects.create(name="Old", identifier="OLD", workspace=setup["source"])
        Project.all_objects.filter(pk=trashed.pk).update(deleted_at=timezone.now())

        with pytest.raises(CommandError, match="OLD"):
            call_command(
                "move_projects_to_workspace",
                "--source=test-workspace",
                "--target=ses-uri",
                "--projects=OLD",
                "--commit",
            )

        assert Project.all_objects.get(pk=trashed.pk).workspace_id == setup["source"].id

    def test_relation_to_an_item_left_behind_blocks(self, setup):
        IssueRelation.objects.create(
            issue=setup["issue"],
            related_issue=setup["stays_issue"],
            project=setup["moved"],
            workspace=setup["source"],
            relation_type="relates_to",
        )

        with pytest.raises(CommandError, match="relations"):
            _move("--commit")

    def test_keeps_source_role_and_reports_new_admins(self, setup):
        WorkspaceMember.objects.filter(workspace=setup["source"], member=setup["other_user"]).update(role=20)

        out = StringIO()
        call_command(
            "move_projects_to_workspace",
            "--source=test-workspace",
            "--target=ses-uri",
            "--projects=MOVED",
            "--commit",
            stdout=out,
        )

        assert WorkspaceMember.objects.get(workspace=setup["target"], member=setup["other_user"]).role == 20
        assert setup["other_user"].email in out.getvalue()
