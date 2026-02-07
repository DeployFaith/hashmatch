import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude engine/agent code from Next.js compilation
  serverExternalPackages: ["crypto"],

  // TODO: Revert to Turbopack once it supports .js → .ts extension resolution
  // See: https://github.com/vercel/next.js/issues/— Turbopack cannot resolve
  // relative imports with ".js" extensions to ".ts" source files. Our repo uses
  // Node ESM-style ".js" specifiers (required for CLI tools / harness / runner).
  // Webpack's extensionAlias bridges this without rewriting imports.
  webpack(config) {
    config.resolve.extensionAlias ??= {};
    config.resolve.extensionAlias[".js"] = [".ts", ".tsx", ".js"];
    return config;
  },
};

export default nextConfig;
