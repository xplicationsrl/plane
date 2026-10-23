# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Field definitions and submission handling for public intake forms."""

# Python imports
import html

# Django imports
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import F

# Module imports
from plane.db.models import (
    CustomProperty,
    CustomPropertyType,
    Intake,
    IntakeForm,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueCustomPropertyValue,
    State,
    StateGroup,
)
from plane.db.models.intake import IntakeIssueStatus
from plane.utils.custom_property import normalize_value, valid_uuids
from plane.utils.issue_copy import record_created_activity

MAX_FIELDS = 30
MAX_TEXT = 10000
STANDARD_FIELDS = {
    "description": "textarea",
    "priority": "priority",
    "submitter_name": "text",
    "submitter_email": "email",
}
PRIORITIES = ("urgent", "high", "medium", "low", "none")
# People fields would expose the member list on a public page
PUBLIC_PROPERTY_TYPES = {
    CustomPropertyType.TEXT,
    CustomPropertyType.NUMBER,
    CustomPropertyType.DATE,
    CustomPropertyType.SELECT,
    CustomPropertyType.MULTI_SELECT,
    CustomPropertyType.CHECKBOX,
    CustomPropertyType.URL,
}
PROPERTY_PREFIX = "property:"


def _property_id(key):
    return key[len(PROPERTY_PREFIX) :] if key.startswith(PROPERTY_PREFIX) else None


def clean_form_fields(project_id, fields):
    """Validate a form's field list against the project; raises ValidationError."""
    if not isinstance(fields, list) or len(fields) > MAX_FIELDS:
        raise ValidationError(f"A form can have at most {MAX_FIELDS} fields.")
    property_ids = valid_uuids([_property_id(f.get("key", "")) for f in fields if isinstance(f, dict)])
    properties = {
        str(p.id): p
        for p in CustomProperty.objects.filter(
            project_id=project_id, id__in=property_ids, property_type__in=PUBLIC_PROPERTY_TYPES
        )
    }
    cleaned, seen = [], set()
    for field in fields:
        if not isinstance(field, dict):
            raise ValidationError("Each field must be an object.")
        key = str(field.get("key", ""))
        prop_id = _property_id(key)
        if key not in STANDARD_FIELDS and (prop_id is None or prop_id not in properties):
            raise ValidationError(f"Unknown field: {key}")
        if key in seen:
            raise ValidationError(f"Duplicate field: {key}")
        seen.add(key)
        cleaned.append(
            {
                "key": key,
                "label": str(field.get("label") or "")[:255],
                "help_text": str(field.get("help_text") or "")[:1000],
                "required": bool(field.get("required", False)),
            }
        )
    return cleaned


def _active_properties(form):
    ids = valid_uuids([_property_id(f["key"]) for f in form.fields if f["key"].startswith(PROPERTY_PREFIX)])
    return {
        str(p.id): p
        for p in CustomProperty.objects.filter(
            project_id=form.project_id, id__in=ids, is_active=True, property_type__in=PUBLIC_PROPERTY_TYPES
        )
    }


def public_form_definition(form):
    """What the public page renders; fields whose property was removed are skipped."""
    properties = _active_properties(form)
    fields = []
    for field in form.fields:
        item = {k: field[k] for k in ("key", "label", "help_text", "required")}
        prop_id = _property_id(field["key"])
        if prop_id:
            prop = properties.get(prop_id)
            if prop is None:
                continue
            item.update(
                {
                    "type": prop.property_type,
                    "label": field["label"] or prop.name,
                    "options": [{"id": o["id"], "name": o["name"]} for o in prop.options or []],
                }
            )
        else:
            item["type"] = STANDARD_FIELDS[field["key"]]
        fields.append(item)
    return {
        "name": form.name,
        "description": form.description,
        "success_message": form.success_message,
        "project_name": form.project.name,
        "fields": fields,
    }


def _text(value, limit):
    if value is None:
        return ""
    if not isinstance(value, (str, int, float)):
        raise ValidationError("Expected text.")
    return str(value).strip()[:limit]


def validate_submission(form, values):
    """Clean submitted values; returns ``(cleaned, errors)`` with errors keyed by field."""
    if not isinstance(values, dict):
        return {}, {"_": ["Invalid submission."]}
    properties = _active_properties(form)
    cleaned, errors = {"properties": {}}, {}

    try:
        title = _text(values.get("name"), 255)
    except ValidationError as error:
        title, errors["name"] = "", error.messages
    if not title:
        errors.setdefault("name", ["This field is required."])
    cleaned["name"] = title

    for field in form.fields:
        key = field["key"]
        raw = values.get(key)
        empty = raw is None or raw == "" or raw == [] or raw is False
        try:
            prop_id = _property_id(key)
            if prop_id:
                prop = properties.get(prop_id)
                if prop is None:
                    continue
                value = (
                    None if empty and prop.property_type != CustomPropertyType.CHECKBOX else normalize_value(prop, raw)
                )
                if value is not None:
                    cleaned["properties"][prop_id] = value
            elif key == "description":
                cleaned["description"] = _text(raw, MAX_TEXT)
            elif key == "priority":
                if not empty and raw not in PRIORITIES:
                    raise ValidationError("Unknown priority.")
                cleaned["priority"] = raw or "none"
            elif key == "submitter_name":
                cleaned["submitter_name"] = _text(raw, 255)
            elif key == "submitter_email":
                email = _text(raw, 255)
                if email:
                    validate_email(email)
                cleaned["submitter_email"] = email
        except ValidationError as error:
            errors[key] = error.messages
            continue
        if field["required"] and empty:
            errors[key] = ["This field is required."]
    return cleaned, errors


def _description_html(cleaned):
    """Plain-text answers rendered as escaped paragraphs, plus who sent the request."""
    parts = [f"<p>{html.escape(line)}</p>" for line in cleaned.get("description", "").splitlines() if line.strip()]
    sender = " ".join(
        part
        for part in (
            cleaned.get("submitter_name", ""),
            f"<{cleaned['submitter_email']}>" if cleaned.get("submitter_email") else "",
        )
        if part
    )
    if sender:
        parts.append(f"<p><em>{html.escape(sender)}</em></p>")
    return "".join(parts) or "<p></p>"


def submit_form(form, cleaned):
    """Create the work item for a validated submission; returns it."""
    project = form.project
    actor_id = form.created_by_id
    with transaction.atomic():
        use_intake = project.intake_view
        state_id = None
        if use_intake:
            triage = State.triage_objects.filter(project=project).first()
            if triage is None:
                triage = State.objects.create(
                    name="Triage",
                    group=StateGroup.TRIAGE.value,
                    project=project,
                    color="#4E5355",
                    sequence=65000,
                )
            state_id = triage.id
        issue = Issue(
            project=project,
            workspace_id=project.workspace_id,
            name=cleaned["name"],
            description_html=_description_html(cleaned),
            priority=cleaned.get("priority", "none"),
            state_id=state_id,
            created_by_id=actor_id,
            updated_by_id=actor_id,
        )
        issue.save()
        if project.default_assignee_id:
            IssueAssignee.objects.create(
                issue=issue, assignee_id=project.default_assignee_id, project=project, created_by_id=actor_id
            )
        IssueCustomPropertyValue.objects.bulk_create(
            [
                IssueCustomPropertyValue(
                    issue=issue,
                    property_id=property_id,
                    value=value,
                    project=project,
                    workspace_id=project.workspace_id,
                    created_by_id=actor_id,
                )
                for property_id, value in cleaned["properties"].items()
            ]
        )
        if use_intake:
            intake = Intake.objects.filter(project=project).first() or Intake.objects.create(
                name=f"{project.name} Intake", project=project, is_default=True
            )
            IntakeIssue.objects.create(
                intake=intake,
                issue=issue,
                project=project,
                status=IntakeIssueStatus.PENDING,
                source="FORM",
                source_email=cleaned.get("submitter_email") or None,
                extra={
                    "form_id": str(form.id),
                    "form_name": form.name,
                    "submitter_name": cleaned.get("submitter_name", ""),
                },
                created_by_id=actor_id,
            )
        record_created_activity(issue, actor_id, comment=f"created the work item from the {form.name} form")
        IntakeForm.objects.filter(pk=form.pk).update(submission_count=F("submission_count") + 1)
    return issue
