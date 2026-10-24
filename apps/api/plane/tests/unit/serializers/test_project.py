# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re

import pytest
from rest_framework import serializers

from plane.api.serializers import ProjectCreateSerializer
from plane.app.serializers import ProjectSerializer
from plane.db.models import Project, User, Workspace

# Names using "-" and "." — must be accepted
VALID_NAMES = ["my-project.v2", "my-project", "release.2026", "a.b-c", "Plane Web-App 1.0"]

# Names with characters that remain forbidden
INVALID_NAMES = ["my@project", "a&b", "x<y>", "what?", "50%", "hi!", "a:b", "a(b)"]


@pytest.fixture
def workspace(db):
    owner = User.objects.create(email="project-owner@example.com", first_name="Owner")
    return Workspace.objects.create(name="Project Workspace", slug="project-workspace", owner=owner)


@pytest.mark.unit
class TestProjectNamePatterns:
    @pytest.mark.parametrize("name", VALID_NAMES)
    def test_name_pattern_allows_hyphen_and_dot(self, name):
        assert re.match(Project.FORBIDDEN_NAME_CHARS_PATTERN, name) is None

    @pytest.mark.parametrize("name", INVALID_NAMES)
    def test_name_pattern_rejects_other_special_characters(self, name):
        assert re.match(Project.FORBIDDEN_NAME_CHARS_PATTERN, name) is not None

    @pytest.mark.parametrize("identifier", ["MY-PROJ", "PROJ.V2"])
    def test_identifier_pattern_still_rejects_hyphen_and_dot(self, identifier):
        assert re.match(Project.FORBIDDEN_IDENTIFIER_CHARS_PATTERN, identifier) is not None


@pytest.mark.unit
class TestAppProjectSerializerName:
    @pytest.mark.parametrize("name", VALID_NAMES)
    def test_validate_name_accepts_hyphen_and_dot(self, workspace, name):
        serializer = ProjectSerializer(context={"workspace_id": workspace.id})
        assert serializer.validate_name(name) == name

    @pytest.mark.parametrize("name", INVALID_NAMES)
    def test_validate_name_rejects_special_characters(self, workspace, name):
        serializer = ProjectSerializer(context={"workspace_id": workspace.id})
        with pytest.raises(serializers.ValidationError) as exc:
            serializer.validate_name(name)
        assert "PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS" in str(exc.value.detail)

    def test_validate_identifier_still_rejects_hyphen(self, workspace):
        serializer = ProjectSerializer(context={"workspace_id": workspace.id})
        with pytest.raises(serializers.ValidationError):
            serializer.validate_identifier("MY-PROJ")


@pytest.mark.unit
class TestApiProjectCreateSerializerName:
    def test_create_accepts_hyphen_and_dot_in_name(self, workspace):
        serializer = ProjectCreateSerializer(
            data={"name": "my-project.v2", "identifier": "MYPROJ"},
            context={"workspace_id": workspace.id},
        )
        assert serializer.is_valid(), serializer.errors
        project = serializer.save()
        assert project.name == "my-project.v2"

    def test_create_rejects_other_special_characters_in_name(self, workspace):
        serializer = ProjectCreateSerializer(
            data={"name": "my@project", "identifier": "MYPROJ"},
            context={"workspace_id": workspace.id},
        )
        assert not serializer.is_valid()

    def test_create_rejects_hyphen_in_identifier(self, workspace):
        serializer = ProjectCreateSerializer(
            data={"name": "my-project.v2", "identifier": "MY-PROJ"},
            context={"workspace_id": workspace.id},
        )
        assert not serializer.is_valid()
