// diagnostics.ts — auto-detect project type, run language-specific checks

import path from "node:path";
import { spawn } from "node:child_process";

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  message: string;
}

export interface ProjectType {
  language: string;
  command: string[];
  cwd: string;
}

const MARKERS: Array<{ file: string; language: string; command: string[] }> = [
  {
    file: "tsconfig.json",
    language: "typescript",
    command: ["npx", "tsc", "--noEmit", "--incremental", "--pretty", "false"],
  },
  {
    file: "pyproject.toml",
    language: "python",
    command: ["pyright", "--outputjson"],
  },
  {
    file: "setup.py",
    language: "python",
    command: ["pyright", "--outputjson"],
  },
  { file: "go.mod", language: "go", command: ["go", "vet", "./..."] },
  {
    file: "Cargo.toml",
    language: "rust",
    command: ["cargo", "check", "--message-format=json"],
  },
  { file: "pom.xml", language: "java", command: ["mvn", "compile", "-q"] },
  {
    file: "build.gradle",
    language: "java",
    command: ["gradle", "compileJava", "-q"],
  },
  {
    file: ".csproj",
    language: "csharp",
    command: ["dotnet", "build", "--no-restore", "--nologo", "-v", "q"],
  },
  { file: "deno.json", language: "deno", command: ["deno", "check", "."] },
];

/**
 * Walk from cwd upward to find project marker files.
 * Returns all detected project types (monorepos can have multiple).
 */
export async function detectProjectTypes(cwd: string): Promise<ProjectType[]> {
  const fs = await import("node:fs/promises");
  const types: ProjectType[] = [];
  let dir = cwd;
  const seen = new Set<string>();

  for (let depth = 0; depth < 4; depth++) {
    for (const marker of MARKERS) {
      if (seen.has(marker.language)) continue;
      try {
        if (marker.file === ".csproj") {
          const entries = await fs.readdir(dir);
          if (entries.some((e) => e.endsWith(".csproj"))) {
            seen.add(marker.language);
            types.push({
              language: marker.language,
              command: marker.command,
              cwd: dir,
            });
          }
          continue;
        }
        await fs.access(path.join(dir, marker.file));
        seen.add(marker.language);
        types.push({
          language: marker.language,
          command: marker.command,
          cwd: dir,
        });
      } catch {
        // File doesn't exist at this level
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return types;
}

/** Run diagnostics for a project type and parse output. */
export async function runDiagnostics(
  projectType: ProjectType,
  signal?: AbortSignal,
): Promise<Diagnostic[]> {
  return new Promise((resolve) => {
    const [cmd, ...args] = projectType.command;
    const child = spawn(cmd, args, {
      cwd: projectType.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    const chunks: Buffer[] = [];
    child.stdout?.on("data", (data: Buffer) => chunks.push(data));
    child.stderr?.on("data", (data: Buffer) => chunks.push(data));

    child.on("close", (code) => {
      if (code === 0) {
        resolve([]);
        return;
      }
      const output = Buffer.concat(chunks).toString("utf-8");
      resolve(parseDiagnostics(projectType.language, output));
    });

    child.on("error", () => resolve([]));
  });
}

// ── Output parsers ─────────────────────────────────────────

function parseDiagnostics(language: string, output: string): Diagnostic[] {
  switch (language) {
    case "typescript":
      return parseTscOutput(output);
    case "python":
      return parsePyrightOutput(output);
    case "go":
      return parseGoVetOutput(output);
    case "rust":
      return parseCargoOutput(output);
    default:
      return parseGenericOutput(output);
  }
}

/** tsc output: file(line,col): error TS1234: message */
function parseTscOutput(output: string): Diagnostic[] {
  const re = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/gm;
  const diagnostics: Diagnostic[] = [];
  let match;
  while ((match = re.exec(output)) !== null) {
    diagnostics.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as "error" | "warning",
      message: match[5],
    });
  }
  return diagnostics;
}

/** pyright --outputjson format */
function parsePyrightOutput(output: string): Diagnostic[] {
  try {
    const parsed = JSON.parse(output) as {
      generalDiagnostics?: Array<{
        severity: string;
        file: string;
        range?: { start?: { line?: number; character?: number } };
        message: string;
      }>;
    };
    if (!parsed.generalDiagnostics) return [];
    return parsed.generalDiagnostics
      .filter((d) => d.severity === "error")
      .map((d) => ({
        file: d.file,
        line: (d.range?.start?.line ?? 0) + 1,
        column: (d.range?.start?.character ?? 0) + 1,
        severity: "error" as const,
        message: d.message,
      }));
  } catch {
    return parseGenericOutput(output);
  }
}

/** go vet output: file.go:line:col: message */
function parseGoVetOutput(output: string): Diagnostic[] {
  const re = /^(.+?\.go):(\d+):(\d+):\s+(.+)$/gm;
  const diagnostics: Diagnostic[] = [];
  let match;
  while ((match = re.exec(output)) !== null) {
    diagnostics.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: "error",
      message: match[4],
    });
  }
  return diagnostics;
}

/** cargo check --message-format=json */
function parseCargoOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split("\n")) {
    try {
      const msg = JSON.parse(line) as {
        reason: string;
        message: {
          level: string;
          message: string;
          spans?: Array<{
            file_name: string;
            line_start: number;
            column_start: number;
          }>;
        };
      };
      if (msg.reason !== "compiler-message") continue;
      const d = msg.message;
      if (d.level !== "error") continue;
      const span = d.spans?.[0];
      diagnostics.push({
        file: span?.file_name ?? "unknown",
        line: span?.line_start ?? 0,
        column: span?.column_start ?? 0,
        severity: "error",
        message: d.message,
      });
    } catch {
      // Not JSON — skip
    }
  }
  return diagnostics;
}

/** Generic fallback: look for file:line:col patterns */
function parseGenericOutput(output: string): Diagnostic[] {
  const re = /^(.+?):(\d+):(\d+):\s*(?:error|Error):\s*(.+)$/gm;
  const diagnostics: Diagnostic[] = [];
  let match;
  while ((match = re.exec(output)) !== null) {
    diagnostics.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: "error",
      message: match[4],
    });
  }
  return diagnostics;
}

/** Format diagnostics for tool result output. */
export function formatDiagnostics(diagnostics: Diagnostic[], maxItems = 10): string {
  if (diagnostics.length === 0) return "";
  const shown = diagnostics.slice(0, maxItems);
  const lines = shown.map((d) => `${d.severity}: ${d.file}:${d.line}:${d.column} — ${d.message}`);
  if (diagnostics.length > maxItems) {
    lines.push(`... and ${diagnostics.length - maxItems} more diagnostic(s)`);
  }
  return lines.join("\n");
}
