"""
API contract integration tests.

Tests that every endpoint:
- Exists at the expected path
- Accepts the expected HTTP method
- Requires auth when it should
- Returns the expected response shape
- Rejects wrong methods with 405

Uses FastAPI TestClient with mocked Supabase — validates the contract
between frontend and backend without a real database.
"""
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TestAuth:
    def test_missing_auth_header_returns_422(self, client):
        res = client.get("/api/conversations")
        assert res.status_code == 422

    def test_invalid_bearer_token_returns_401(self, client):
        res = client.get("/api/conversations", headers={"Authorization": "Bearer garbage"})
        assert res.status_code == 401

    def test_expired_token_returns_401_with_detail(self, client, expired_auth_header):
        res = client.get("/api/conversations", headers=expired_auth_header)
        assert res.status_code == 401
        assert res.json()["detail"] == "token_expired"

    def test_no_bearer_prefix_returns_401(self, client):
        res = client.get("/api/conversations", headers={"Authorization": "Basic abc"})
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

class TestConversations:
    def test_list_conversations(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(
            data=[{"id": "c1", "title": "Test", "updated_at": "2025-01-01"}],
            count=1,
        )
        res = client.get("/api/conversations", headers=auth_header)
        assert res.status_code == 200
        body = res.json()
        assert "conversations" in body
        assert "total" in body

    def test_list_supports_pagination(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[], count=0)
        res = client.get("/api/conversations?limit=10&offset=20", headers=auth_header)
        assert res.status_code == 200

    def test_create_conversation(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[{"id": "c-new", "title": "New chat"}])
        res = client.post(
            "/api/conversations",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"title": "New chat"},
        )
        assert res.status_code == 201
        assert "conversation" in res.json()

    def test_delete_conversation_path_param(self, client, auth_header, mock_supabase):
        """Frontend sends DELETE /api/conversations/{id}."""
        mock_supabase._chain.set_result(data={"id": "c1"})
        res = client.delete("/api/conversations/c1", headers=auth_header)
        assert res.status_code == 200
        assert res.json()["success"] is True

    def test_delete_conversation_query_param_fails(self, client, auth_header):
        """Ensure ?id= query param style doesn't accidentally work."""
        res = client.delete("/api/conversations?id=c1", headers=auth_header)
        assert res.status_code in (404, 405, 422)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class TestDocuments:
    def test_list_documents(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[])
        res = client.get("/api/documents", headers=auth_header)
        assert res.status_code == 200
        assert "documents" in res.json()

    def test_delete_document_path_param(self, client, auth_header, mock_supabase):
        """Frontend sends DELETE /api/documents/{id}."""
        mock_supabase._chain.set_result(data={"id": "d1", "storage_path": "user/file.pdf"})
        mock_supabase.storage.from_.return_value.remove.return_value = None
        res = client.delete("/api/documents/d1", headers=auth_header)
        assert res.status_code == 200
        assert res.json()["success"] is True

    def test_delete_document_query_param_fails(self, client, auth_header):
        """Ensure ?id= query param style doesn't work."""
        res = client.delete("/api/documents?id=d1", headers=auth_header)
        assert res.status_code in (404, 405, 422)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

class TestMessages:
    def test_get_messages(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[{"id": "m1", "role": "user", "content": "hi"}])
        res = client.get("/api/conversations/c1/messages", headers=auth_header)
        assert res.status_code == 200
        body = res.json()
        assert "messages" in body
        assert isinstance(body["messages"], list)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

class TestProfile:
    def test_get_profile(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data={"id": "user-123", "preferred_model": "gpt-4.1-mini"})
        res = client.get("/api/profile", headers=auth_header)
        assert res.status_code == 200
        assert "profile" in res.json()

    def test_update_profile(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[{"id": "user-123", "preferred_model": "openai/gpt-4.1"}])
        res = client.patch(
            "/api/profile",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"preferred_model": "openai/gpt-4.1"},
        )
        assert res.status_code == 200
        assert "profile" in res.json()

    def test_update_profile_invalid_model(self, client, auth_header):
        res = client.patch(
            "/api/profile",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"preferred_model": "not-a-real-model"},
        )
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Rate Limit
# ---------------------------------------------------------------------------

class TestRateLimit:
    def test_get_rate_limit(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[], count=5)
        res = client.get("/api/rate-limit", headers=auth_header)
        assert res.status_code == 200
        body = res.json()
        for key in ("allowed", "remaining", "limit", "resetsAt"):
            assert key in body, f"Missing key: {key}"


# ---------------------------------------------------------------------------
# Agent Logs
# ---------------------------------------------------------------------------

class TestAgentLogs:
    def test_requires_auth(self, client):
        """Frontend must use authFetch, not plain fetch."""
        res = client.get("/api/agent/logs")
        assert res.status_code == 422

    def test_get_agent_logs(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[], count=0)
        res = client.get("/api/agent/logs?limit=10&offset=0", headers=auth_header)
        assert res.status_code == 200
        body = res.json()
        assert "logs" in body
        assert "total" in body


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

class TestGraph:
    def test_get_graph(self, client, auth_header, mock_supabase):
        mock_supabase._chain.set_result(data=[])
        res = client.get("/api/graph", headers=auth_header)
        assert res.status_code == 200
        body = res.json()
        assert "nodes" in body
        assert "edges" in body


# ---------------------------------------------------------------------------
# Auth Refresh
# ---------------------------------------------------------------------------

class TestAuthRefresh:
    def test_refresh_requires_body(self, client):
        res = client.post("/api/auth/refresh", json={})
        assert res.status_code == 422

    def test_refresh_missing_token_returns_400(self, client):
        res = client.post("/api/auth/refresh", json={"refresh_token": ""})
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

class TestUpload:
    def test_requires_auth(self, client):
        res = client.post("/api/upload")
        assert res.status_code == 422

    def test_rejects_unsupported_mime(self, client, auth_header):
        res = client.post(
            "/api/upload",
            headers=auth_header,
            files={"file": ("test.exe", b"content", "application/octet-stream")},
        )
        assert res.status_code == 400

    def test_accepts_pdf(self, client, auth_header, mock_supabase):
        mock_supabase.storage.from_.return_value.upload.return_value = None
        mock_supabase._chain.set_result(data=[{
            "id": "d1", "filename": "test.pdf", "status": "pending",
        }])

        with patch("api.upload._run_ingestion", return_value=None):
            res = client.post(
                "/api/upload",
                headers=auth_header,
                files={"file": ("test.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
        assert res.status_code == 201
        assert "document" in res.json()


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

class TestQuery:
    def test_requires_auth(self, client):
        res = client.post("/api/query", json={
            "conversationId": "c1",
            "messages": [{"role": "user", "parts": [{"type": "text", "text": "hi"}]}],
        })
        assert res.status_code == 422

    def test_requires_conversation_id(self, client, auth_header):
        res = client.post(
            "/api/query",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"conversationId": "", "messages": []},
        )
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Method Not Allowed
# ---------------------------------------------------------------------------

class TestMethodNotAllowed:
    def test_get_on_upload(self, client, auth_header):
        res = client.get("/api/upload", headers=auth_header)
        assert res.status_code == 405

    def test_post_on_documents(self, client, auth_header):
        res = client.post("/api/documents", headers=auth_header)
        assert res.status_code == 405

    def test_put_on_conversations(self, client, auth_header):
        res = client.put("/api/conversations", headers=auth_header)
        assert res.status_code == 405
