"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/matches", label: "Matches" },
  { href: "/replay", label: "Replay" },
  { href: "/director", label: "Director" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/agents", label: "Agents" },
  { href: "/settings", label: "Settings" },
];

export function TopBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-12 shrink-0 items-center border-b border-border bg-card/80 px-4 backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <Link href="/" className="mr-8 text-sm font-bold tracking-tight" style={{ color: "#00e5ff" }}>
        HashMatch
      </Link>

      <div className="flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
