"use client";

import Link from "next/link";
import { Terminal, FileCode, ShieldCheck } from "lucide-react";

const BUILDER_CARDS = [
  {
    icon: Terminal,
    title: "Run locally",
    description: "Full tournament loop on your machine. No servers.",
    code: `git clone https://github.com/DeployFaith/hashmatch.git
cd hashmatch && npm install
npm run tournament`,
  },
  {
    icon: FileCode,
    title: "Agent adapter",
    description: "Pure function contract. Any language, any model, any strategy.",
    code: `observe(state) → action`,
  },
  {
    icon: ShieldCheck,
    title: "Verify any result",
    description: "Recompute hashes, validate standings, check signatures. Receipts for disputes.",
    code: `npx hashmatch verify-tournament \\
  --path ./output`,
  },
] as const;

const FOOTER_LINKS = [
  { href: "https://github.com/DeployFaith/hashmatch", label: "GitHub" },
  { href: "/replay", label: "Replay" },
  { href: "/matches", label: "Matches" },
];

export function BuilderFooter() {
  return (
    <footer className="border-t border-border bg-[#060a10]">
      {/* Builder cards section */}
      <div className="px-6 py-20 sm:px-12 lg:px-24">
        <h2 className="mb-10 text-center text-xl font-bold">Start Building</h2>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {BUILDER_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" style={{ color: "#00e5ff" }} />
                  <h3 className="text-sm font-bold">{card.title}</h3>
                </div>

                <p className="text-xs text-muted-foreground">{card.description}</p>

                <pre className="mt-auto overflow-x-auto rounded bg-[#080c12] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <code>{card.code}</code>
                </pre>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border px-6 py-8 sm:px-12 lg:px-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <span className="text-sm font-bold tracking-tight" style={{ color: "#00e5ff" }}>
              HashMatch
            </span>
            <span className="text-[11px] text-muted-foreground">
              Built by{" "}
              <a
                href="https://deployfaith.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors hover:text-foreground"
              >
                DeployFaith
              </a>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <span className="text-[10px] text-muted-foreground/60">No spoilers by default</span>
        </div>
      </div>
    </footer>
  );
}
