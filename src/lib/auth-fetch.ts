"use client";

/**
 * Authenticated fetch wrapper for API calls to the FastAPI backend.
 *
 * - Caches the access token in memory to avoid calling getSession() on every request
 * - On 401 with detail="token_expired", refreshes once and retries
 * - Delegates all other errors to the caller unchanged
 */

import { createClient } from "@/lib/supabase/client";

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 30s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  cachedToken = session.access_token;
  // expires_at is in seconds
  tokenExpiresAt = (session.expires_at ?? 0) * 1000;
  return cachedToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const refreshToken = data.session?.refresh_token;
  if (!refreshToken) return null;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;

    const { access_token, refresh_token } = await res.json();
    // Persist the refreshed session so subsequent calls get the new token
    await supabase.auth.setSession({ access_token, refresh_token });
    cachedToken = access_token;
    // Assume 1hr expiry if not provided
    tokenExpiresAt = Date.now() + 3600_000;
    return access_token;
  } catch {
    return null;
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  // Attempt a single token refresh on expiry
  if (res.status === 401) {
    let detail: string | undefined;
    try {
      const clone = res.clone();
      const body = await clone.json();
      detail = body?.detail;
    } catch {
      // ignore parse errors
    }

    if (detail === "token_expired") {
      // Invalidate cache so refresh is forced
      cachedToken = null;
      tokenExpiresAt = 0;

      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        return fetch(input, { ...init, headers: retryHeaders });
      }
    }
  }

  return res;
}
