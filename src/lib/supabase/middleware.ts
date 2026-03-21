import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password");

  const isAnonymous = (user as { is_anonymous?: boolean } | null)?.is_anonymous ?? false;

  // API routes are proxied to the FastAPI backend which handles its own auth.
  // Don't redirect them — a redirect response breaks fetch() calls from the client.
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  // Unauthenticated users can only access auth routes
  if (!user && !isAuthRoute && !isApiRoute && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated non-anonymous users shouldn't see auth pages
  // Exceptions: reset-password (needed after clicking email reset link) and signup for anonymous users
  const isResetPassword = request.nextUrl.pathname.startsWith("/reset-password");
  if (user && !isAnonymous && isAuthRoute && !isResetPassword) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
