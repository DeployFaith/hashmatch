import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stableStringify } from "../core/json.js";
import { generateDescription, generatePreview } from "../games/heist/preview.js";
import { generateHeistDebugView } from "../games/heist/debugView.js";
import { generateHeistScenario, HEIST_PRESETS } from "../games/heist/generator.js";
import type { HeistGeneratorConfig } from "../games/heist/generatorTypes.js";
import { generateLayoutReport } from "../games/heist/layoutReport.js";
import type { HeistScenarioParams } from "../games/heist/types.js";
import { validateHeistScenario } from "../games/heist/validator.js";

interface ScenarioFile {
  schemaVersion: "0.1.0";
  scenarioId: string;
  gameId: "heist";
  gameVersion: "0.1.0";
  params: HeistScenarioParams;
}

interface ScenarioCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const writeLine = (buffer: string[], line: string): void => {
  buffer.push(line.endsWith("\n") ? line : `${line}\n`);
};

const parseSeed = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
};

const parseGenArgs = (
  argv: string[],
): {
  ok: true;
  game: string;
  seed: number;
  preset?: string;
  configPath?: string;
  outDir: string;
  validate: boolean;
} | { ok: false; error: string } => {
  let game: string | undefined;
  let seed: number | undefined;
  let preset: string | undefined;
  let configPath: string | undefined;
  let outDir: string | undefined;
  let validate = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--game" && i + 1 < argv.length) {
      game = argv[++i];
    } else if (arg === "--seed" && i + 1 < argv.length) {
      seed = parseSeed(argv[++i]);
    } else if (arg === "--preset" && i + 1 < argv.length) {
      preset = argv[++i];
    } else if (arg === "--config" && i + 1 < argv.length) {
      configPath = argv[++i];
    } else if (arg === "--out" && i + 1 < argv.length) {
      outDir = argv[++i];
    } else if (arg === "--validate") {
      validate = true;
    }
  }

  if (!game) {
    return { ok: false, error: "Missing --game." };
  }
  if (game !== "heist") {
    return { ok: false, error: `Unsupported game: ${game}.` };
  }
  if (seed === undefined) {
    return { ok: false, error: "Missing or invalid --seed." };
  }
  if (!outDir) {
    return { ok: false, error: "Missing --out." };
  }
  if (preset && configPath) {
    return { ok: false, error: "--preset and --config are mutually exclusive." };
  }

  return {
    ok: true,
    game,
    seed,
    preset,
    configPath,
    outDir,
    validate,
  };
};

const parsePathArg = (
  argv: string[],
): { ok: true; path: string } | { ok: false; error: string } => {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && i + 1 < argv.length) {
      return { ok: true, path: argv[i + 1] };
    }
  }
  return { ok: false, error: "Missing --path." };
};

const parseDebugViewArgs = (
  argv: string[],
): { ok: true; file: string; out: string } | { ok: false; error: string } => {
  let game: string | undefined;
  let file: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--game" && i + 1 < argv.length) {
      game = argv[++i];
    } else if (arg === "--file" && i + 1 < argv.length) {
      file = argv[++i];
    } else if (arg === "--out" && i + 1 < argv.length) {
      out = argv[++i];
    }
  }
  if (!game) {
    return { ok: false, error: "Missing --game." };
  }
  if (game !== "heist") {
    return { ok: false, error: `Unsupported game: ${game}.` };
  }
  if (!file) {
    return { ok: false, error: "Missing --file." };
  }
  if (!out) {
    return { ok: false, error: "Missing --out." };
  }
  return { ok: true, file, out };
};

const readScenarioFile = (path: string): ScenarioFile => {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as ScenarioFile;
  if (!parsed || typeof parsed !== "object" || !("params" in parsed)) {
    throw new Error("Invalid scenario file format.");
  }
  return parsed;
};

const formatValidationErrors = (errors: { message: string }[]): string[] =>
  errors.map((error) => `- ${error.message}`);

const buildScenarioFile = (
  params: HeistScenarioParams,
  scenarioId: string,
): ScenarioFile => ({
  schemaVersion: "0.1.0",
  scenarioId,
  gameId: "heist",
  gameVersion: "0.1.0",
  params,
});

const resolvePresetConfig = (preset: string): HeistGeneratorConfig => {
  const config = HEIST_PRESETS[preset];
  if (!config) {
    throw new Error(`Unknown preset: ${preset}.`);
  }
  return config;
};

export function runScenarioCli(argv: string[], cwd = process.cwd()): ScenarioCliResult {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const command = argv[0];

  if (!command) {
    writeLine(
      stderr,
      "Missing command. Available: gen, validate, preview, describe, debug-view, layout-report.",
    );
    return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
  }

  if (command === "gen") {
    const parsed = parseGenArgs(argv.slice(1));
    if (!parsed.ok) {
      writeLine(stderr, parsed.error);
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }

    try {
      let config: HeistGeneratorConfig | undefined;
      if (parsed.configPath) {
        const raw = readFileSync(resolve(cwd, parsed.configPath), "utf-8");
        config = JSON.parse(raw) as HeistGeneratorConfig;
      } else if (parsed.preset) {
        config = resolvePresetConfig(parsed.preset);
      }

      const scenarioParams = generateHeistScenario(config ?? {}, parsed.seed);
      const scenarioIdSuffix = parsed.preset ?? (parsed.configPath ? "custom" : "default");
      const scenarioId = `heist:${scenarioIdSuffix}-${parsed.seed}`;
      const scenario = buildScenarioFile(scenarioParams, scenarioId);
      const outputPath = resolve(cwd, parsed.outDir, "scenario.json");
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${stableStringify(scenario)}\n`, "utf-8");

      writeLine(
        stdout,
        `Generated scenario ${scenarioId} (${scenarioParams.map.rooms.length} rooms).`,
      );
      writeLine(stdout, `Wrote ${outputPath}`);

      if (parsed.validate) {
        const validation = validateHeistScenario(scenarioParams);
        if (!validation.ok) {
          writeLine(stderr, "Scenario validation failed:");
          for (const line of formatValidationErrors(validation.errors)) {
            writeLine(stderr, line);
          }
          return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
        }
        writeLine(stdout, "Scenario validation passed.");
      }

      return { code: 0, stdout: stdout.join(""), stderr: stderr.join("") };
    } catch (error) {
      writeLine(
        stderr,
        error instanceof Error ? error.message : "Failed to generate scenario.",
      );
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
  }

  if (command === "validate") {
    const parsed = parsePathArg(argv.slice(1));
    if (!parsed.ok) {
      writeLine(stderr, parsed.error);
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
    try {
      const scenario = readScenarioFile(resolve(cwd, parsed.path));
      const validation = validateHeistScenario(scenario.params);
      if (!validation.ok) {
        writeLine(stderr, "Scenario validation failed:");
        for (const line of formatValidationErrors(validation.errors)) {
          writeLine(stderr, line);
        }
        return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
      }
      writeLine(stdout, "Scenario is valid.");
      return { code: 0, stdout: stdout.join(""), stderr: stderr.join("") };
    } catch (error) {
      writeLine(
        stderr,
        error instanceof Error ? error.message : "Failed to read scenario file.",
      );
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
  }

  if (command === "preview" || command === "describe") {
    const parsed = parsePathArg(argv.slice(1));
    if (!parsed.ok) {
      writeLine(stderr, parsed.error);
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
    try {
      const scenario = readScenarioFile(resolve(cwd, parsed.path));
      const validation = validateHeistScenario(scenario.params);
      if (!validation.ok) {
        writeLine(stderr, "Scenario validation failed:");
        for (const line of formatValidationErrors(validation.errors)) {
          writeLine(stderr, line);
        }
        return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
      }
      const verbose = argv.includes("--verbose");
      const output =
        command === "preview"
          ? generatePreview(scenario.params, { verbose })
          : `${generateDescription(scenario.params)}\n`;
      writeLine(stdout, output);
      return { code: 0, stdout: stdout.join(""), stderr: stderr.join("") };
    } catch (error) {
      writeLine(
        stderr,
        error instanceof Error ? error.message : "Failed to read scenario file.",
      );
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
  }

  if (command === "debug-view") {
    const parsed = parseDebugViewArgs(argv.slice(1));
    if (!parsed.ok) {
      writeLine(stderr, parsed.error);
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
    try {
      const scenario = readScenarioFile(resolve(cwd, parsed.file));
      const validation = validateHeistScenario(scenario.params);
      if (!validation.ok) {
        writeLine(stderr, "Scenario validation failed:");
        for (const line of formatValidationErrors(validation.errors)) {
          writeLine(stderr, line);
        }
        return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
      }
      const svg = generateHeistDebugView(scenario.params);
      const outputPath = resolve(cwd, parsed.out);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, svg, "utf-8");
      writeLine(stdout, `Wrote ${outputPath}`);
      return { code: 0, stdout: stdout.join(""), stderr: stderr.join("") };
    } catch (error) {
      writeLine(
        stderr,
        error instanceof Error ? error.message : "Failed to generate debug view.",
      );
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
  }

  if (command === "layout-report") {
    const parsed = parsePathArg(argv.slice(1));
    if (!parsed.ok) {
      writeLine(stderr, parsed.error);
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
    try {
      const scenario = readScenarioFile(resolve(cwd, parsed.path));
      const validation = validateHeistScenario(scenario.params);
      if (!validation.ok) {
        writeLine(stderr, "Scenario validation failed:");
        for (const line of formatValidationErrors(validation.errors)) {
          writeLine(stderr, line);
        }
        return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
      }
      writeLine(stdout, generateLayoutReport(scenario.params));
      return { code: 0, stdout: stdout.join(""), stderr: stderr.join("") };
    } catch (error) {
      writeLine(
        stderr,
        error instanceof Error ? error.message : "Failed to generate layout report.",
      );
      return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
    }
  }

  writeLine(stderr, `Unknown command: ${command}.`);
  return { code: 1, stdout: stdout.join(""), stderr: stderr.join("") };
}

function main(): void {
  const result = runScenarioCli(process.argv.slice(2));
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.code);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  main();
}
