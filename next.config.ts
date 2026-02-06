import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude engine/agent code from Next.js compilation
  serverExternalPackages: ["crypto"],
};

export default nextConfig;
