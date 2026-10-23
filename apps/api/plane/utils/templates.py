# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Snapshotting and applying work item and project templates."""

# Python imports
from uuid import UUID

# Django imports
from django.core.exceptions import ValidationError
from django.db import transaction

# Module imports
from plane.db.models import (
    CustomProperty,
    EstimatePoint,
    Issue,
    IssueAssignee,
    IssueCustomPropertyValue,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    ProjectMember,
    State,
    StateGroup,
    WorkItemTemplate,
)
from plane.utils.custom_property import normalize_options, normalize_value, valid_uuids
from plane.utils.issue_copy import add_issue_relations, record_created_activity

MAX_SUB_ISSUES = 50
MAX_TEMPLATE_WORK_ITEMS = 200
PRIORITIES = {"urgent", "high", "medium", "low", "none"}
PROJECT_FEATURES = ("module_view", "cycle_view", "issue_views_view", "page_view", "intake_view")


# --- work item templates -------------------------------------------------------------


def snapshot_work_item(issue):
    """The template data that recreates ``issue`` and its direct sub-work items."""

    def fields(item):
        return {
            "name": item.name,
            "description_html": item.description_html or "<p></p>",
            "priority": item.priority,
            "assignee_ids": [
                str(i) for i in IssueAssignee.objects.filter(issue=item).values_list("assignee_id", flat=True)
            ],
            "label_ids": [str(i) for i in IssueLabel.objects.filter(issue=item).values_list("label_id", flat=True)],
        }

    data = fields(issue)
    data.update(
        {
            "state_id": str(issue.state_id) if issue.state_id else None,
            "estimate_point_id": str(issue.estimate_point_id) if issue.estimate_point_id else None,
            "module_ids": [str(i) for i in ModuleIssue.objects.filter(issue=issue).values_list("module_id", flat=True)],
            "custom_properties": {
                str(row["property_id"]): row["value"]
                for row in IssueCustomPropertyValue.objects.filter(issue=issue).values("property_id", "value")
            },
            "sub_issues": [fields(child) for child in Issue.issue_objects.filter(parent=issue).order_by("sequence_id")],
        }
    )
    return data


def _ids_in(values, queryset, field="id"):
    wanted = valid_uuids(values if isinstance(values, list) else [])
    found = {str(i) for i in queryset.filter(**{f"{field}__in": wanted}).values_list(field, flat=True)}
    return [i for i in wanted if i in found]


def sanitize_work_item_template(project_id, data):
    """Keep only what fits ``project_id``: unknown ids are dropped, bad values rejected."""
    if not isinstance(data, dict):
        raise ValidationError("Template must be an object.")
    members = ProjectMember.objects.filter(project_id=project_id, is_active=True)
    labels = Label.objects.filter(project_id=project_id)

    def clean_item(item):
        if not isinstance(item, dict):
            raise ValidationError("Each sub-work item must be an object.")
        name = str(item.get("name", "")).strip()[:255]
        priority = item.get("priority", "none")
        return {
            "name": name,
            "description_html": str(item.get("description_html") or "<p></p>"),
            "priority": priority if priority in PRIORITIES else "none",
            "assignee_ids": _ids_in(item.get("assignee_ids"), members, "member_id"),
            "label_ids": _ids_in(item.get("label_ids"), labels),
        }

    cleaned = clean_item(data)
    state_ids = _ids_in([data.get("state_id")], State.objects.filter(project_id=project_id))
    estimate_ids = _ids_in([data.get("estimate_point_id")], EstimatePoint.objects.filter(project_id=project_id))
    cleaned["state_id"] = state_ids[0] if state_ids else None
    cleaned["estimate_point_id"] = estimate_ids[0] if estimate_ids else None
    cleaned["module_ids"] = _ids_in(data.get("module_ids"), Module.objects.filter(project_id=project_id))

    custom = data.get("custom_properties") or {}
    if not isinstance(custom, dict):
        raise ValidationError("custom_properties must be an object.")
    properties = {
        str(p.id): p for p in CustomProperty.objects.filter(project_id=project_id, id__in=valid_uuids(custom))
    }
    cleaned["custom_properties"] = {}
    for property_id, value in custom.items():
        prop = properties.get(str(property_id))
        if prop is None:
            continue
        normalized = normalize_value(prop, value)
        if normalized is not None:
            cleaned["custom_properties"][str(prop.id)] = normalized

    sub_issues = data.get("sub_issues") or []
    if not isinstance(sub_issues, list) or len(sub_issues) > MAX_SUB_ISSUES:
        raise ValidationError(f"A template can have at most {MAX_SUB_ISSUES} sub-work items.")
    cleaned["sub_issues"] = [item for item in (clean_item(item) for item in sub_issues) if item["name"]]
    return cleaned


def apply_work_item_template_extras(issue, data, actor_id):
    """Add a template's sub-work items and custom property values to a new work item.

    The create form already sent the template's own fields; these are the parts it can't.
    """
    with transaction.atomic():
        for item in data.get("sub_issues", []):
            child = Issue(
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                parent=issue,
                name=item["name"],
                description_html=item["description_html"],
                priority=item["priority"],
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            child.save()
            add_issue_relations(
                child, actor_id=actor_id, assignee_ids=item["assignee_ids"], label_ids=item["label_ids"]
            )
            record_created_activity(child, actor_id)

        existing = set(IssueCustomPropertyValue.objects.filter(issue=issue).values_list("property_id", flat=True))
        IssueCustomPropertyValue.objects.bulk_create(
            [
                IssueCustomPropertyValue(
                    issue=issue,
                    property_id=property_id,
                    value=value,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                )
                for property_id, value in data.get("custom_properties", {}).items()
                if property_id not in {str(p) for p in existing}
            ]
        )


# --- project templates ---------------------------------------------------------------


def snapshot_project(project, include_work_items=False):
    """A project's structure as id-free data, cross-referenced by names."""
    states = list(State.objects.filter(project=project).exclude(group=StateGroup.TRIAGE.value).order_by("sequence"))
    labels = list(Label.objects.filter(project=project).select_related("parent").order_by("sort_order"))
    properties = list(CustomProperty.objects.filter(project=project))
    state_names = {s.id: s.name for s in states}
    label_names = {lbl.id: lbl.name for lbl in labels}
    property_names = {p.id: p.name for p in properties}

    def named_custom_values(values):
        return {property_names[pid]: value for pid, value in values.items() if pid in property_names}

    data = {
        "settings": {feature: getattr(project, feature) for feature in PROJECT_FEATURES},
        "states": [
            {"name": s.name, "color": s.color, "group": s.group, "sequence": s.sequence, "default": s.default}
            for s in states
        ],
        "labels": [
            {"name": lbl.name, "color": lbl.color, "parent": lbl.parent.name if lbl.parent else None} for lbl in labels
        ],
        "custom_properties": [
            {
                "name": p.name,
                "description": p.description,
                "property_type": p.property_type,
                "options": p.options,
                "sort_order": p.sort_order,
                "is_active": p.is_active,
            }
            for p in properties
        ],
        "work_item_templates": [],
        "work_items": [],
    }

    def portable(template):
        """A work item template with names in place of project-specific ids."""

        def label_list(ids):
            return [label_names[UUID(i)] for i in ids if UUID(i) in label_names]

        custom = {UUID(pid): value for pid, value in (template.get("custom_properties") or {}).items()}
        return {
            "name": template.get("name", ""),
            "description_html": template.get("description_html", "<p></p>"),
            "priority": template.get("priority", "none"),
            "state": state_names.get(UUID(template["state_id"])) if template.get("state_id") else None,
            "labels": label_list(template.get("label_ids") or []),
            "custom_properties": named_custom_values(custom),
            "sub_issues": [
                {
                    "name": child["name"],
                    "description_html": child.get("description_html", "<p></p>"),
                    "priority": child.get("priority", "none"),
                    "labels": label_list(child.get("label_ids") or []),
                }
                for child in template.get("sub_issues", [])
            ],
        }

    for template in WorkItemTemplate.objects.filter(project=project):
        data["work_item_templates"].append(
            {"name": template.name, "description": template.description, "template": portable(template.template)}
        )

    if include_work_items:
        roots = Issue.issue_objects.filter(project=project, parent__isnull=True).order_by("sequence_id")
        for issue in roots[:MAX_TEMPLATE_WORK_ITEMS]:
            data["work_items"].append(portable(snapshot_work_item(issue)))
    return data


def _named_template_to_ids(template, states, labels, properties):
    """Inverse of ``portable``: resolve names against the target project."""
    custom = {}
    for name, value in (template.get("custom_properties") or {}).items():
        prop = properties.get(name)
        if prop is None:
            continue
        try:
            normalized = normalize_value(prop, value)
        except ValidationError:
            continue
        if normalized is not None and prop.property_type != "member":
            custom[str(prop.id)] = normalized
    state = states.get(template.get("state") or "")
    return {
        "name": str(template.get("name", ""))[:255],
        "description_html": str(template.get("description_html") or "<p></p>"),
        "priority": template.get("priority") if template.get("priority") in PRIORITIES else "none",
        "state_id": str(state.id) if state else None,
        "assignee_ids": [],
        "label_ids": [str(labels[name].id) for name in template.get("labels", []) if name in labels],
        "module_ids": [],
        "estimate_point_id": None,
        "custom_properties": custom,
        "sub_issues": [
            {
                "name": str(child.get("name", ""))[:255],
                "description_html": str(child.get("description_html") or "<p></p>"),
                "priority": child.get("priority") if child.get("priority") in PRIORITIES else "none",
                "assignee_ids": [],
                "label_ids": [str(labels[name].id) for name in child.get("labels", []) if name in labels],
            }
            for child in (template.get("sub_issues") or [])[:MAX_SUB_ISSUES]
            if str(child.get("name", "")).strip()
        ],
    }


def apply_project_template(project, data, actor_id):
    """Shape ``project`` after a project template.

    States from the template are added (matched by name) and become the only ones when the
    project has no work items yet; labels, custom properties, work item templates and
    starter work items are added alongside what the project already has.
    """
    if not isinstance(data, dict):
        raise ValidationError("Invalid template data.")
    audit = {"created_by_id": actor_id, "updated_by_id": actor_id}

    with transaction.atomic():
        for feature, enabled in (data.get("settings") or {}).items():
            if feature in PROJECT_FEATURES:
                setattr(project, feature, bool(enabled))
        project.save(update_fields=[*PROJECT_FEATURES, "updated_at"])

        # States
        states = {s.name: s for s in State.objects.filter(project=project)}
        template_states = [s for s in data.get("states", []) if s.get("group") in StateGroup.values]
        for item in template_states:
            if item["name"] not in states:
                states[item["name"]] = State.objects.create(
                    project=project,
                    name=item["name"][:255],
                    color=item.get("color") or "#6b7280",
                    group=item["group"],
                    sequence=item.get("sequence", 65535),
                    **audit,
                )
        default_name = next((s["name"] for s in template_states if s.get("default")), None)
        if default_name in states:
            State.objects.filter(project=project).exclude(pk=states[default_name].pk).update(default=False)
            State.objects.filter(pk=states[default_name].pk).update(default=True)
        if template_states and not Issue.objects.filter(project=project).exists():
            keep = {s["name"] for s in template_states}
            for name, state in list(states.items()):
                if name not in keep and not state.is_triage:
                    state.delete(soft=False)
                    del states[name]

        # Labels, parents after children exist
        labels = {lbl.name: lbl for lbl in Label.objects.filter(project=project)}
        for item in data.get("labels", []):
            if item.get("name") and item["name"] not in labels:
                labels[item["name"]] = Label.objects.create(
                    project=project, name=item["name"][:255], color=item.get("color") or "", **audit
                )
        for item in data.get("labels", []):
            parent = labels.get(item.get("parent") or "")
            if parent and item.get("name") in labels and labels[item["name"]].parent_id != parent.id:
                Label.objects.filter(pk=labels[item["name"]].pk).update(parent=parent)

        # Custom properties
        properties = {p.name: p for p in CustomProperty.objects.filter(project=project)}
        for item in data.get("custom_properties", []):
            name = str(item.get("name", "")).strip()[:255]
            if (
                not name
                or name in properties
                or item.get("property_type") not in dict(CustomProperty._meta.get_field("property_type").choices)
            ):
                continue
            options = item.get("options") or []
            if item["property_type"] in ("select", "multi_select"):
                options = normalize_options(options)
            properties[name] = CustomProperty.objects.create(
                project=project,
                name=name,
                description=str(item.get("description", "")),
                property_type=item["property_type"],
                options=options if item["property_type"] in ("select", "multi_select") else [],
                sort_order=item.get("sort_order", 65535),
                is_active=bool(item.get("is_active", True)),
                **audit,
            )

        # Work item templates
        for item in data.get("work_item_templates", []):
            if not str(item.get("name", "")).strip():
                continue
            WorkItemTemplate.objects.create(
                project=project,
                name=str(item["name"])[:255],
                description=str(item.get("description", "")),
                template=_named_template_to_ids(item.get("template") or {}, states, labels, properties),
                **audit,
            )

        # Starter work items
        for item in (data.get("work_items") or [])[:MAX_TEMPLATE_WORK_ITEMS]:
            resolved = _named_template_to_ids(item, states, labels, properties)
            if not resolved["name"].strip():
                continue
            issue = Issue(
                project=project,
                workspace_id=project.workspace_id,
                name=resolved["name"],
                description_html=resolved["description_html"],
                priority=resolved["priority"],
                state_id=resolved["state_id"],
                **audit,
            )
            issue.save()
            add_issue_relations(issue, actor_id=actor_id, label_ids=resolved["label_ids"])
            record_created_activity(issue, actor_id)
            apply_work_item_template_extras(issue, resolved, actor_id)
