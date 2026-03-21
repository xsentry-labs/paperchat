"use client";

/**
 * Authenticated fetch wrapper for API calls to the FastAPI backend.
 *
 * - Reads the current Supabase session and attaches Authorization: Bearer <token>
 * - On 401 with detail="token_expired", calls /api/auth/refresh once and retries
 * - Delegates all other errors to the caller unchanged
 */

import { createClient } from "@/lib/supabase/client";

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
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
