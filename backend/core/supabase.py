from functools import lru_cache
from supabase import create_client, Client
from .config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Service-role client — bypasses RLS. Use only for internal/admin operations."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
