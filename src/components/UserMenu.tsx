"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  email: string;
  isAnonymous: boolean;
}

export function UserMenu({ email, isAnonymous }: UserMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-t border-border p-3 space-y-2">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {isAnonymous ? "G" : (email[0]?.toUpperCase() ?? "?")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm text-foreground">
            {isAnonymous ? "Guest" : email}
          </p>
          {isAnonymous && (
            <p className="text-xs text-muted-foreground truncate">
              Sign up to save your work
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {isAnonymous ? (
          <>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => router.push("/signup")}
            >
              Create account
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => router.push("/settings")}
            >
              Settings
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={handleSignOut}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
