"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "./SidebarProvider";

interface UserMenuProps {
  email: string;
  isAnonymous: boolean;
}

export function UserMenu({ email, isAnonymous }: UserMenuProps) {
  const router = useRouter();
  const { collapsed } = useSidebar();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Collapsed: just show avatar
  if (collapsed) {
    return (
      <div className="hidden md:flex border-t border-border p-2 justify-center">
        <button
          onClick={() => router.push(isAnonymous ? "/signup" : "/settings")}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-hover text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          title={isAnonymous ? "Sign up" : email}
        >
          {isAnonymous ? "G" : (email[0]?.toUpperCase() ?? "?")}
        </button>
      </div>
    );
  }

  // Expanded
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover text-[10px] font-medium text-muted-foreground">
          {isAnonymous ? "G" : (email[0]?.toUpperCase() ?? "?")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs text-foreground/80">
            {isAnonymous ? "Guest" : email}
          </p>
        </div>
        <div className="flex gap-1">
          {isAnonymous ? (
            <button
              onClick={() => router.push("/signup")}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign up
            </button>
          ) : (
            <button
              onClick={() => router.push("/settings")}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Settings
            </button>
          )}
          <span className="text-muted-foreground/30">·</span>
          <button
            onClick={handleSignOut}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {isAnonymous ? "Exit" : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}
