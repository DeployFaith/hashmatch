"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Swords,
  Trophy,
  Users,
  Workflow,
  Settings,
  Sun,
  Moon,
  LayoutDashboard,
  GitCompare,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

const navItems = [
  { href: "/", label: "Arena", icon: LayoutDashboard },
  { href: "/matches", label: "Matches", icon: Swords },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/replay", label: "Replay", icon: Play },
  { href: "/director", label: "Director", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useAppStore();

  return (
    <div className="flex h-screen overflow-hidden" data-theme={theme}>
      {/* Sidebar */}
      <nav
        className="flex w-56 shrink-0 flex-col border-r border-border bg-card"
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <GitCompare className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold tracking-tight">HashMatch</span>
        </div>

        <div className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-border p-2">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
