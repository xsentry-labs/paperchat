import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/UserMenu";
import { FileExplorer } from "@/components/file-explorer/FileExplorer";
import { ConversationList } from "@/components/chat/ConversationList";

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
      {/* Sidebar */}
      <aside className="flex w-72 flex-col border-r border-border bg-sidebar">
        <div className="flex h-14 items-center border-b border-border px-4">
          <h1 className="text-lg font-semibold text-foreground">paperchat</h1>
        </div>

        <div className="flex-1 overflow-y-auto">
          <FileExplorer />
          <ConversationList />
        </div>

        <UserMenu email={user.email ?? ""} />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
