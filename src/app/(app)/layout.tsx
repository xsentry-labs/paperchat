import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/UserMenu";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar">
        <div className="flex h-12 items-center px-4">
          <span className="text-sm font-semibold tracking-tight text-foreground">paperchat</span>
        </div>

        <div className="flex-1 overflow-hidden">
          <Sidebar />
        </div>

        <UserMenu email={user.email ?? ""} isAnonymous={(user as { is_anonymous?: boolean }).is_anonymous ?? false} />
      </aside>

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-background">{children}</main>
    </div>
  );
}
