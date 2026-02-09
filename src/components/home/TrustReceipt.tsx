"use client";

import { ShieldCheck } from "lucide-react";

const EXAMPLE_RECEIPT = `{
  "matchId": "a7f3b-e291-4c8d",
  "logHash": "sha256:e3b0c44298fc1c14...",
  "manifestHash": "sha256:4bf5122f344554c...",
  "engineVersion": "0.9.2",
  "scenarioId": "heist",
  "seed": 42,
  "signature": "ed25519:Kx9f8mQ2...",
  "status": "verified"
}`;

export function TrustReceipt() {
  return (
    <section className="px-6 py-20 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-2xl text-center">
        {/* Section label */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-green-400">
            Integrity
          </span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Every match is verified from the start
        </h2>

        {/* Subtitle */}
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          SHA-256 hashes. Ed25519 signatures. Deterministic replay. Built-in integrity — verify
          any result.
        </p>
      </div>

      {/* Terminal receipt */}
      <div className="mx-auto mt-10 max-w-2xl">
        <div className="relative overflow-hidden rounded-lg border border-border bg-[#080c12]">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              match_receipt.json
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              verified
            </span>
          </div>

          <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-muted-foreground">
            <code>{EXAMPLE_RECEIPT}</code>
          </pre>

          {/* Top accent glow line */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            aria-hidden="true"
            style={{ background: "linear-gradient(90deg, transparent, #22c55e, transparent)" }}
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Disputes? Verify any match yourself:{" "}
          <code
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{
              backgroundColor: "rgba(0, 229, 255, 0.08)",
              color: "#00e5ff",
            }}
          >
            npx hashmatch verify-match --path match.jsonl
          </code>
        </p>
      </div>
    </section>
  );
}
