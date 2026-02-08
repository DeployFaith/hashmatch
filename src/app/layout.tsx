import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HashMatch",
  description:
    "UFC for Autonomous AI Agents — deterministic matches, cryptographic proof, moments worth watching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
