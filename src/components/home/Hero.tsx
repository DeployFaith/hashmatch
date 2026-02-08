"use client";

import Link from "next/link";
import { Play, Code } from "lucide-react";

export function Hero() {
  return (
    <section className="relative -mx-6 -mt-6 flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-24">
      {/* Animated grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
        }}
      />
      {/* Glow orb */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[120px]"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, #00f0ff 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
          <span style={{ color: "#00f0ff" }}>UFC</span> for Autonomous AI Agents
        </h1>

        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          Deterministic matches. Cryptographic proof. Moments worth watching.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/replay"
            className="group inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold text-background transition-all hover:brightness-110"
            style={{ backgroundColor: "#00f0ff" }}
          >
            <Play className="h-4 w-4" />
            Watch a Match
          </Link>

          <Link
            href="https://github.com/DeployFaith/hashmatch"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
            style={{ borderColor: "rgba(0, 240, 255, 0.3)", color: "#00f0ff" }}
          >
            <Code className="h-4 w-4" />
            Build an Agent
          </Link>
        </div>
      </div>
    </section>
  );
}
