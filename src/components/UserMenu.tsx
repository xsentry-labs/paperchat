"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "./SidebarProvider";
import { useTheme } from "./ThemeProvider";

interface UserMenuProps {
  email: string;
  isAnonymous: boolean;
}

function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      onClick={toggleTheme}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-hover transition-all duration-150"
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
    >
      {isLight ? (
        // Moon icon
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6a9.718 9.718 0 01.002-3.752A9.753 9.753 0 003 12c0 5.385 4.365 9.75 9.75 9.75 4.722 0 8.685-3.354 9.752-7.998z" />
        </svg>
      ) : (
        // Sun icon
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      )}
    </button>
  );
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

  // Collapsed: stack avatar + theme toggle
  if (collapsed) {
    return (
      <div className="hidden md:flex border-t border-border p-2 flex-col items-center gap-1.5">
        <ThemeToggle iconOnly />
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
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <span className="text-muted-foreground/20">·</span>
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
          <span className="text-muted-foreground/20">·</span>
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
