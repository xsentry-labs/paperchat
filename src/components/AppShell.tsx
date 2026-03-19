"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { SidebarProvider, useSidebar } from "./SidebarProvider";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

interface AppShellProps {
  email: string;
  isAnonymous: boolean;
  children: React.ReactNode;
}

function MobileMenuButton() {
  const { setMobileOpen } = useSidebar();
  return (
    <button
      onClick={() => setMobileOpen(true)}
      className="fixed top-3 left-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-card/80 backdrop-blur-sm border border-border/40 text-muted-foreground hover:text-foreground transition-colors md:hidden"
      aria-label="Open menu"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>
  );
}

function CollapseToggle() {
  const { collapsed, toggleCollapsed } = useSidebar();
  return (
    <button
      onClick={toggleCollapsed}
      className="hidden md:flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-hover transition-all duration-150"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <svg
        className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
  );
}

function ShellInner({ email, isAnonymous, children }: AppShellProps) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <div className="flex h-screen">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-border/30
          transition-all duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:relative md:z-0
          ${collapsed ? "md:w-16" : "md:w-64"}
          w-64
        `}
      >
        {/* Header */}
        <div className={`flex h-12 items-center shrink-0 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          {collapsed ? (
            <span className="text-sm font-semibold text-foreground">p</span>
          ) : (
            <span className="text-sm font-semibold tracking-tight text-foreground">paperchat</span>
          )}
          <CollapseToggle />
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-hidden">
          <Sidebar />
        </div>

        {/* User */}
        <UserMenu email={email} isAnonymous={isAnonymous} />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-background relative">
        <MobileMenuButton />
        {children}
      </main>
    </div>
  );
}

export function AppShell({ email, isAnonymous, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <ShellInner email={email} isAnonymous={isAnonymous}>
        {children}
      </ShellInner>
    </SidebarProvider>
  );
}
