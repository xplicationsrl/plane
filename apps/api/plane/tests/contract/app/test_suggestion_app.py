# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for leaving suggestions from the home screen and reading them with an API key."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.views.suggestion.base import SuggestionThrottle
from plane.db.models import APIToken, Suggestion, User, WorkspaceMember
from plane.license.models import Instance, InstanceAdmin

READ_URL = "/api/v1/suggestions/"


def create_url(slug):
    return f"/api/workspaces/{slug}/suggestions/"


def _user():
    return User.objects.create(email=f"s-{uuid4().hex[:8]}@example.com", username=uuid4().hex[:12])


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _key_client(user):
    token = APIToken.objects.create(user=user, label="suggestions", token=f"key-{uuid4().hex}")
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)
    return client


@pytest.fixture
def instance(db):
    return Instance.objects.create(
        instance_name="Test",
        instance_id=uuid4().hex,
        current_version="1",
        latest_version="1",
        last_checked_at="2026-01-01T00:00:00Z",
    )


@pytest.mark.contract
class TestLeaveSuggestion:
    @pytest.mark.parametrize("role", [20, 15, 5])
    def test_any_workspace_role_can_leave_one(self, db, workspace, role):
        user = _user()
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)

        response = _client(user).post(create_url(workspace.slug), {"body": "  Dark mode please  "}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        suggestion = Suggestion.objects.get(id=response.data["id"])
        assert suggestion.body == "Dark mode please"
        assert suggestion.workspace_id == workspace.id
        assert suggestion.created_by_id == user.id

    def test_non_member_is_refused(self, db, workspace):
        response = _client(_user()).post(create_url(workspace.slug), {"body": "Let me in"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Suggestion.objects.exists()

    def test_former_member_is_refused(self, db, workspace):
        user = _user()
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=False)

        response = _client(user).post(create_url(workspace.slug), {"body": "Still here"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_is_refused(self, db, workspace):
        response = APIClient().post(create_url(workspace.slug), {"body": "Anon"}, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.parametrize(
        "payload",
        [{}, {"body": ""}, {"body": "   "}, {"body": "x" * (Suggestion.MAX_BODY_LENGTH + 1)}],
        ids=["missing", "empty", "whitespace", "too-long"],
    )
    def test_invalid_body_is_rejected(self, session_client, workspace, payload):
        response = session_client.post(create_url(workspace.slug), payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Suggestion.objects.exists()

    def test_client_cannot_set_author_or_workspace(self, session_client, workspace, create_user):
        other = _user()

        response = session_client.post(
            create_url(workspace.slug), {"body": "Mine", "created_by": str(other.id), "workspace": "x"}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert Suggestion.objects.get().created_by_id == create_user.id

    def test_rate_limited_per_person(self, session_client, workspace, monkeypatch):
        monkeypatch.setattr(SuggestionThrottle, "rate", "2/hour")
        url = create_url(workspace.slug)

        codes = [session_client.post(url, {"body": f"Idea {n}"}, format="json").status_code for n in range(3)]

        assert codes == [status.HTTP_201_CREATED, status.HTTP_201_CREATED, status.HTTP_429_TOO_MANY_REQUESTS]


@pytest.mark.contract
class TestReadSuggestions:
    def test_instance_admin_key_reads_all_with_author_newest_first(self, session_client, workspace, instance):
        session_client.post(create_url(workspace.slug), {"body": "First"}, format="json")
        session_client.post(create_url(workspace.slug), {"body": "Second"}, format="json")
        admin = _user()
        InstanceAdmin.objects.create(instance=instance, user=admin, role=20)

        response = _key_client(admin).get(READ_URL)

        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert [row["body"] for row in results] == ["Second", "First"]
        assert results[0]["workspace"] == workspace.slug
        assert results[0]["author_email"]

    def test_author_removed_still_reads(self, db, workspace, instance):
        Suggestion(workspace=workspace, body="Orphan").save(disable_auto_set_user=True)
        admin = _user()
        InstanceAdmin.objects.create(instance=instance, user=admin, role=20)

        response = _key_client(admin).get(READ_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"][0]["author_email"] is None

    def test_key_of_non_admin_is_refused(self, db, workspace, instance, create_user):
        Suggestion.objects.create(workspace=workspace, body="Private")

        response = _key_client(create_user).get(READ_URL)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "results" not in response.data

    def test_no_key_is_refused(self, db, instance):
        assert APIClient().get(READ_URL).status_code == status.HTTP_401_UNAUTHORIZED
