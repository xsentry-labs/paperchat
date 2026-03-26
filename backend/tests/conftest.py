"""Shared fixtures for backend integration tests."""
import os

# Set env vars BEFORE any app imports
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("ENCRYPTION_SECRET", "test-secret-32-chars-minimum-ok!")

import base64
import json
import sys
import time
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

# Pre-mock heavy/unavailable third-party modules so main.py can import
for mod_name in ["supabase", "spacy", "pymupdf", "fitz", "docx", "pptx",
                 "openpyxl", "bs4", "lxml", "ebooklib", "pandas", "numpy"]:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()


def _make_jwt(user_id: str = "user-123", email: str = "test@example.com", exp_offset: int = 3600) -> str:
    """Create a minimal JWT for testing (not cryptographically signed)."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": user_id,
        "email": email,
        "exp": int(time.time()) + exp_offset,
        "aud": "authenticated",
        "role": "authenticated",
    }).encode()).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(b"fakesig").rstrip(b"=").decode()
    return f"{header}.{payload}.{sig}"


@pytest.fixture()
def auth_header():
    """Valid Authorization header for test user."""
    return {"Authorization": f"Bearer {_make_jwt()}"}


@pytest.fixture()
def expired_auth_header():
    """Expired Authorization header."""
    return {"Authorization": f"Bearer {_make_jwt(exp_offset=-3600)}"}


class _SupabaseChain(MagicMock):
    """Mock that returns itself for every chained call, mimicking Supabase query builder.
    Call .set_result(data=..., count=...) to configure what .execute() returns."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._chain_result = MagicMock(data=[], count=0)

    def __getattr__(self, name):
        if name.startswith("_") or name in ("set_result",):
            return super().__getattr__(name)
        # Every chained method returns self
        return MagicMock(return_value=self)

    def set_result(self, data=None, count=0):
        self._chain_result = MagicMock(data=data or [], count=count)

    def execute(self):
        return self._chain_result


def _mock_supabase():
    """Create a mock Supabase client with chainable query builder."""
    mock = MagicMock()
    chain = _SupabaseChain()
    mock.table = MagicMock(return_value=chain)
    mock.rpc = MagicMock(return_value=chain)
    mock.storage = MagicMock()
    mock._chain = chain  # Expose for test configuration
    return mock


@pytest.fixture()
def mock_supabase():
    """Patch get_supabase_admin everywhere it's used."""
    mock = _mock_supabase()

    # Patch at every module that imports get_supabase_admin
    patches = [
        patch("api.conversations.get_supabase_admin", return_value=mock),
        patch("api.documents.get_supabase_admin", return_value=mock),
        patch("api.messages.get_supabase_admin", return_value=mock),
        patch("api.upload.get_supabase_admin", return_value=mock),
        patch("api.profile.get_supabase_admin", return_value=mock),
        patch("api.graph.get_supabase_admin", return_value=mock),
        patch("api.query.get_supabase_admin", return_value=mock),
        patch("core.rate_limit.get_supabase_admin", return_value=mock),
        patch("core.agent_logger.get_supabase_admin", return_value=mock),
    ]
    for p in patches:
        p.start()
    yield mock
    for p in patches:
        p.stop()


@pytest.fixture()
def client(mock_supabase):
    """FastAPI TestClient with mocked Supabase."""
    from main import app
    with TestClient(app) as c:
        yield c
