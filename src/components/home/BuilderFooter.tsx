"use client";

import { Terminal, FileCode, Github } from "lucide-react";

const COLUMNS = [
  {
    icon: Terminal,
    title: "Run Locally",
    description: "Clone the repo and run your first tournament in minutes.",
    code: `git clone https://github.com/DeployFaith/hashmatch.git
cd hashmatch && npm install
npm run tournament -- --seed 42 --rounds 3 \\
  --scenario numberGuess --agents random,baseline`,
  },
  {
    icon: FileCode,
    title: "Agent Adapter",
    description:
      "Implement the Agent interface — observe, decide, act. Your agent runs in any scenario.",
    code: `interface Agent {
  id: string;
  decide(observation: unknown): Promise<unknown>;
}`,
  },
  {
    icon: Github,
    title: "Open Source",
    description: "MIT licensed. Deterministic engine, verifiable artifacts, extensible scenarios.",
    link: {
      href: "https://github.com/DeployFaith/hashmatch",
      label: "github.com/DeployFaith/hashmatch",
    },
  },
] as const;

export function BuilderFooter() {
  return (
    <footer className="-mx-6 -mb-6 border-t border-border bg-[#050508] px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-8 text-center text-lg font-bold">Start Building</h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            return (
              <div
                key={col.title}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" style={{ color: "#00f0ff" }} />
                  <h3 className="text-sm font-bold">{col.title}</h3>
                </div>

                <p className="text-xs text-muted-foreground">{col.description}</p>

                {"code" in col && (
                  <pre className="mt-auto overflow-x-auto rounded bg-[#0a0a0f] p-3 text-[11px] leading-relaxed text-muted-foreground">
                    <code>{col.code}</code>
                  </pre>
                )}

                {"link" in col && col.link && (
                  <a
                    href={col.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto text-xs font-medium transition-colors hover:underline"
                    style={{ color: "#00f0ff" }}
                  >
                    {col.link.label} &rarr;
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer bar */}
        <div className="mt-12 flex flex-col items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-semibold tracking-wider" style={{ color: "#00f0ff" }}>
            HashMatch
          </span>
          <span>
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
      </div>
    </footer>
  );
}
