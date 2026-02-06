import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Agent League",
  description: "Multi-agent system arena, match viewer, and flow inspector",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
    <body className="antialiased" suppressHydrationWarning>
    <AppShell>{children}</AppShell>
    </body>
    </html>
  );
}
