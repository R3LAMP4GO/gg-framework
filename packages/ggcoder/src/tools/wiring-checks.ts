import path from "node:path";
import type { ToolOperations } from "./operations.js";

export interface WiringWarning {
  type: "unresolved_import" | "unconsumed_export";
  message: string;
}

/**
 * Regex to match ES import/export-from statements with relative paths.
 * Captures the module specifier (the string inside quotes).
 * Matches: import ... from './foo'  |  export ... from '../bar'
 */
const RELATIVE_IMPORT_RE = /(?:import|export)\s+.*?\s+from\s+['"](\.[^'"]+)['"]/g;

/**
 * Dynamic import() with relative paths.
 * Matches: import('./foo')  |  await import('../bar')
 */
const DYNAMIC_IMPORT_RE = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Extensions to try when resolving bare specifiers (no extension). */
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Index files to try when specifier points to a directory. */
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

/** File extensions eligible for import-path scanning. */
const SCANNABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]);

/**
 * Check that every relative import in `content` resolves to an existing file.
 * Only checks relative specifiers (starting with `.`); bare/package imports are skipped.
 */
export async function checkImportsResolve(
  content: string,
  filePath: string,
  cwd: string,
  ops: ToolOperations,
): Promise<WiringWarning[]> {
  const dir = path.dirname(filePath);
  const specifiers = new Set<string>();

  for (const re of [RELATIVE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      specifiers.add(m[1]);
    }
  }

  const warnings: WiringWarning[] = [];

  for (const specifier of specifiers) {
    const resolved = path.resolve(dir, specifier);
    if (await fileExists(resolved, ops)) continue;

    // Try adding extensions
    const ext = path.extname(specifier);
    if (!ext) {
      let found = false;
      for (const tryExt of RESOLVE_EXTENSIONS) {
        if (await fileExists(resolved + tryExt, ops)) {
          found = true;
          break;
        }
      }
      if (found) continue;

      // Try as directory with index file
      for (const indexFile of INDEX_FILES) {
        if (await fileExists(path.join(resolved, indexFile), ops)) {
          found = true;
          break;
        }
      }
      if (found) continue;
    }

    const relSpecifier = path.relative(cwd, resolved) || specifier;
    warnings.push({
      type: "unresolved_import",
      message: `Import '${specifier}' does not resolve to any file (tried ${relSpecifier})`,
    });
  }

  return warnings;
}

/**
 * Check that a newly created file is imported by at least one other file.
 * Uses fast-glob + string search — no regex, no streaming.
 * Only call this for NEW files (write tool), not edits.
 */
export async function checkExportsConsumed(
  filePath: string,
  cwd: string,
  ops: ToolOperations,
): Promise<WiringWarning[]> {
  const fg = await import("fast-glob");

  const entries = await fg.default("**/*.{ts,tsx,js,jsx,mts,mjs}", {
    cwd,
    dot: false,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**"],
  });

  const targetParsed = path.parse(filePath);
  const isIndex = targetParsed.name === "index";

  for (const entry of entries) {
    const absPath = path.join(cwd, entry);
    // Skip self
    if (path.resolve(absPath) === path.resolve(filePath)) continue;

    const ext = path.extname(entry).toLowerCase();
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    // Compute the relative import path from this file to the target
    const fromDir = path.dirname(absPath);
    let rel = path.relative(fromDir, filePath);
    // Ensure it starts with ./ or ../
    if (!rel.startsWith(".")) rel = `./${rel}`;

    // Build needles: without extension, with extension, and directory (for index files)
    const relParsed = path.parse(rel);
    const noExt = path.join(relParsed.dir, relParsed.name);
    const needles = [noExt, rel];
    if (isIndex) {
      needles.push(relParsed.dir || ".");
    }

    try {
      const fileContent = await ops.readFile(absPath);
      for (const needle of needles) {
        // Check for the needle followed by a quote (single or double)
        if (fileContent.includes(`${needle}'`) || fileContent.includes(`${needle}"`)) {
          return []; // Found a consumer — no warning
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  const relPath = path.relative(cwd, filePath);
  return [
    {
      type: "unconsumed_export",
      message: `Nothing imports from '${relPath}' yet — ensure it's imported where needed`,
    },
  ];
}

/**
 * Format warnings into a compact string for tool results.
 * Returns empty string if no warnings (zero noise).
 */
export function formatWarnings(warnings: WiringWarning[]): string {
  if (warnings.length === 0) return "";
  return warnings.map((w) => `⚠ Wiring: ${w.message}`).join("\n");
}

async function fileExists(filePath: string, ops: ToolOperations): Promise<boolean> {
  try {
    const stat = await ops.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
