# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from collections import OrderedDict

# Django imports
from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.core.management import BaseCommand, CommandError
from django.db import models, transaction

# Module imports
from plane.db.models import (
    Issue,
    IssueLabel,
    IssueProjectLink,
    Page,
    Project,
    ProjectMember,
    ProjectPage,
    Workspace,
    WorkspaceMember,
)


def _fk_to(model, field_name, target):
    """Return True when `model.field_name` is a ForeignKey/OneToOne pointing at `target`."""
    try:
        field = model._meta.get_field(field_name)
    except FieldDoesNotExist:
        return False
    return isinstance(field, models.ForeignKey) and field.related_model is target


def move_projects(source, target, identifiers):
    """
    Move the projects with the given identifiers from `source` to `target` workspace.

    Every row that hangs off a moved project (directly, through one of its work items,
    or through one of its pages) gets its `workspace` re-pointed at `target`. Workspace
    level data that the projects depend on (workspace labels, issue types, pages shared
    with projects that stay behind) is reported as a blocker instead of being guessed at.

    Returns (counts, warnings). Raises CommandError on blockers.
    """
    if source.id == target.id:
        raise CommandError("Source and target workspace are the same")

    projects = list(Project.all_objects.filter(workspace=source, identifier__in=identifiers))
    missing = sorted(set(identifiers) - {p.identifier for p in projects})
    if missing:
        raise CommandError(f"Projects not found in '{source.slug}': {', '.join(missing)}")

    project_ids = [p.id for p in projects]
    clashes = Project.all_objects.filter(workspace=target, deleted_at__isnull=True).filter(
        models.Q(identifier__in=[p.identifier for p in projects]) | models.Q(name__in=[p.name for p in projects])
    )
    if clashes.exists():
        names = ", ".join(clashes.values_list("name", flat=True))
        raise CommandError(f"Target workspace already has projects with the same name/identifier: {names}")

    issue_ids = Issue.all_objects.filter(project_id__in=project_ids).values("id")
    page_ids = set(ProjectPage._base_manager.filter(project_id__in=project_ids).values_list("page_id", flat=True))

    blockers = []
    shared_pages = (
        ProjectPage._base_manager.filter(page_id__in=page_ids, deleted_at__isnull=True)
        .exclude(project_id__in=project_ids)
        .values_list("page__name", flat=True)
    )
    if shared_pages:
        blockers.append(f"Pages also linked to projects that stay in '{source.slug}': {', '.join(set(shared_pages))}")

    workspace_labels = (
        IssueLabel._base_manager.filter(issue_id__in=issue_ids, deleted_at__isnull=True)
        .exclude(label__project_id__in=project_ids)
        .values_list("label__name", flat=True)
    )
    if workspace_labels:
        blockers.append(f"Work items use labels that don't belong to the moved projects: {', '.join(set(workspace_labels))}")

    typed = Issue.all_objects.filter(project_id__in=project_ids, type__isnull=False)
    if typed.exists():
        blockers.append(f"{typed.count()} work items use workspace-level issue types")

    if blockers:
        raise CommandError("Cannot move projects:\n- " + "\n- ".join(blockers))

    warnings = []
    cross_links = (
        IssueProjectLink._base_manager.filter(deleted_at__isnull=True)
        .filter(
            models.Q(issue_id__in=issue_ids, project__workspace=source)
            | models.Q(project_id__in=project_ids, issue__project__workspace=source)
        )
        .exclude(issue__project_id__in=project_ids, project_id__in=project_ids)
    )
    if cross_links.exists():
        warnings.append(f"{cross_links.count()} work item links point across the two workspaces after the move")

    counts = OrderedDict()
    counts["Project"] = Project.all_objects.filter(id__in=project_ids).update(workspace=target)

    for model in apps.get_models():
        if model is Project or model._meta.proxy or not model._meta.managed:
            continue
        if not _fk_to(model, "workspace", Workspace):
            continue

        manager = model._base_manager
        condition = models.Q()
        if _fk_to(model, "project", Project):
            condition |= models.Q(project_id__in=project_ids)
        if _fk_to(model, "issue", Issue):
            condition |= models.Q(issue_id__in=issue_ids)
        if model is Page:
            condition |= models.Q(id__in=page_ids)
        if _fk_to(model, "page", Page):
            condition |= models.Q(page_id__in=page_ids)
        if not condition:
            # Workspace-level data (views, stickies, workspace members, ...) stays put
            continue

        updated = manager.filter(condition, workspace=source).update(workspace=target)
        if updated:
            counts[model.__name__] = updated

        # Self-parents left behind in the source workspace (favorite folders, parent pages)
        try:
            parent = model._meta.get_field("parent")
        except FieldDoesNotExist:
            parent = None
        if isinstance(parent, models.ForeignKey) and parent.related_model is model and parent.null:
            manager.filter(workspace=target, parent__isnull=False).exclude(parent__workspace=target).update(
                parent=None
            )

    # Everyone active on a moved project needs to be a member of the target workspace
    member_ids = set(
        ProjectMember._base_manager.filter(
            project_id__in=project_ids, is_active=True, deleted_at__isnull=True
        ).values_list("member_id", flat=True)
    )
    source_roles = dict(
        WorkspaceMember.objects.filter(workspace=source, member_id__in=member_ids).values_list("member_id", "role")
    )
    added = 0
    for member_id in member_ids:
        workspace_member = WorkspaceMember.objects.filter(workspace=target, member_id=member_id).first()
        if workspace_member is None:
            WorkspaceMember.objects.create(workspace=target, member_id=member_id, role=source_roles.get(member_id, 5))
            added += 1
        elif not workspace_member.is_active:
            workspace_member.is_active = True
            workspace_member.save(update_fields=["is_active"])
            added += 1
    counts["WorkspaceMember (added)"] = added

    return counts, warnings


class Command(BaseCommand):
    help = "Move projects (with all their work items, pages, members, ...) to another workspace. Dry run unless --commit"

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, help="Source workspace slug")
        parser.add_argument("--target", required=True, help="Target workspace slug")
        parser.add_argument("--projects", required=True, help="Comma separated project identifiers")
        parser.add_argument("--commit", action="store_true", help="Apply the changes (default is a dry run)")

    def handle(self, *args, **options):
        source = Workspace.objects.filter(slug=options["source"]).first()
        target = Workspace.objects.filter(slug=options["target"]).first()
        if not source or not target:
            raise CommandError("Source or target workspace not found")

        identifiers = [i.strip() for i in options["projects"].split(",") if i.strip()]
        if not identifiers:
            raise CommandError("No project identifiers given")

        with transaction.atomic():
            counts, warnings = move_projects(source, target, identifiers)
            if not options["commit"]:
                transaction.set_rollback(True)

        for name, count in counts.items():
            self.stdout.write(f"{name}: {count}")
        for warning in warnings:
            self.stdout.write(self.style.WARNING(f"Warning: {warning}"))

        if options["commit"]:
            self.stdout.write(self.style.SUCCESS(f"Moved {len(identifiers)} projects to '{target.slug}'"))
        else:
            self.stdout.write(self.style.NOTICE("Dry run, nothing changed. Re-run with --commit to apply."))
