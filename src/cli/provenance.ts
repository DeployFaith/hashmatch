import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface EngineProvenance {
  engineCommit?: string;
  engineVersion?: string;
}

function readGitCommit(): string | undefined {
  try {
    const output = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return output.length > 0 ? output : undefined;
  } catch {
    return undefined;
  }
}

function readPackageVersion(): string | undefined {
  try {
    const packageUrl = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(packageUrl, "utf-8")) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

export function resolveEngineProvenance(
  overrides: EngineProvenance,
  shouldEmit: boolean,
): EngineProvenance | undefined {
  if (!shouldEmit) {
    return undefined;
  }

  const engineCommit = overrides.engineCommit ?? readGitCommit();
  const engineVersion = overrides.engineVersion ?? readPackageVersion();

  if (!engineCommit && !engineVersion) {
    return undefined;
  }

  return { engineCommit, engineVersion };
}
