"use client";

import { ShieldCheck } from "lucide-react";

const EXAMPLE_RECEIPT = `{
  "matchId": "m_demo_001",
  "logHash": "sha256:e3b0c44298fc1c14...",
  "manifestHash": "sha256:4bf5122f344554c...",
  "engineVersion": "0.2.0",
  "scenarioId": "numberGuess",
  "seed": 42,
  "agents": ["alice", "bob"],
  "turns": 5,
  "status": "verified"
}`;

export function TrustReceipt() {
  return (
    <section className="py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5" style={{ color: "#00f0ff" }} />
          <h2 className="text-lg font-bold">Every Match Produces a Verifiable Artifact</h2>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Deterministic execution. SHA-256 integrity hashes. Every action, every outcome, every
          result is sealed and independently verifiable.
        </p>

        <div className="relative overflow-hidden rounded-lg border border-border bg-[#0a0a0f]">
          {/* "example" label */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              match_manifest.json
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "rgba(0, 240, 255, 0.1)",
                color: "#00f0ff",
              }}
            >
              example
            </span>
          </div>

          <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-muted-foreground">
            <code>{EXAMPLE_RECEIPT}</code>
          </pre>

          {/* Accent border glow */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            aria-hidden="true"
            style={{ background: "linear-gradient(90deg, transparent, #00f0ff, transparent)" }}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Verify any match locally:{" "}
          <code
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{
              backgroundColor: "rgba(0, 240, 255, 0.08)",
              color: "#00f0ff",
            }}
          >
            npm run replay -- --in match.jsonl
          </code>
        </p>
      </div>
    </section>
  );
}
