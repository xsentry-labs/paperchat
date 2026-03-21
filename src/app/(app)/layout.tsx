import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth redirect is handled by middleware (307 Temporary Redirect).
  // Do NOT call redirect("/login") here — Server Component redirects use 308
  // (Permanent Redirect) which the browser caches, causing an infinite loop
  // when the user later logs in and middleware redirects back to "/".
  if (!user) {
    // Middleware should have already redirected; return nothing as a safety net.
    return null;
  }

  return (
    <AppShell
      email={user.email ?? ""}
      isAnonymous={(user as { is_anonymous?: boolean }).is_anonymous ?? false}
    >
      {children}
    </AppShell>
  );
}
