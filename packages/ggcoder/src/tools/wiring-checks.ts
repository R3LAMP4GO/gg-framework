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
    if (path.resolve(absPath) === path.resolve(filePath)) continue;

    const ext = path.extname(entry).toLowerCase();
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    const fromDir = path.dirname(absPath);
    let rel = path.relative(fromDir, filePath);
    if (!rel.startsWith(".")) rel = `./${rel}`;

    const relParsed = path.parse(rel);
    const noExt = path.join(relParsed.dir, relParsed.name);
    const needles = [noExt, rel];
    if (isIndex) {
      needles.push(relParsed.dir || ".");
    }

    try {
      const fileContent = await ops.readFile(absPath);
      for (const needle of needles) {
        if (fileContent.includes(`${needle}'`) || fileContent.includes(`${needle}"`)) {
          return [];
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

// ── Phase 4: Behavioral Rules ──────────────────────────────

/**
 * Common globals and built-in type names that should NOT trigger
 * "missing import" warnings.
 */
const GLOBAL_IDENTIFIERS = new Set([
  "React",
  "Promise",
  "Error",
  "Map",
  "Set",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Date",
  "JSON",
  "Math",
  "RegExp",
  "Symbol",
  "Buffer",
  "Infinity",
  "NaN",
  "Record",
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "ReturnType",
  "Parameters",
  "InstanceType",
  "Awaited",
  "Uppercase",
  "Lowercase",
  "Capitalize",
  "Uncapitalize",
  "NonNullable",
  "ConstructorParameters",
  "ThisParameterType",
  "OmitThisParameter",
  "ReadonlyArray",
  "PromiseLike",
  "PropertyKey",
  "ArrayLike",
  "Iterable",
  "Iterator",
  "AsyncIterable",
  "AsyncIterator",
  "Generator",
  "AsyncGenerator",
  "WeakMap",
  "WeakSet",
  "WeakRef",
  "FinalizationRegistry",
  "Proxy",
  "Reflect",
  "DataView",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "Atomics",
  "BigInt",
  "Int8Array",
  "Uint8Array",
  "Float32Array",
  "Float64Array",
  "Int16Array",
  "Int32Array",
  "Uint16Array",
  "Uint32Array",
  "Uint8ClampedArray",
  "BigInt64Array",
  "BigUint64Array",
  "TextEncoder",
  "TextDecoder",
  "URL",
  "URLSearchParams",
  "Headers",
  "Request",
  "Response",
  "FormData",
  "Blob",
  "File",
  "AbortController",
  "AbortSignal",
  "Event",
  "EventTarget",
  "MessageChannel",
  "MessagePort",
  "HTMLElement",
  "HTMLDivElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "HTMLFormElement",
  "HTMLAnchorElement",
  "HTMLImageElement",
  "HTMLSpanElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Document",
  "Node",
  "NodeList",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "IntersectionObserver",
  "ResizeObserver",
  "PerformanceObserver",
  "Worker",
  "ServiceWorker",
  "Notification",
  "WebSocket",
  "XMLHttpRequest",
  "Storage",
  "Navigator",
  "Location",
  "History",
  "Screen",
  "Window",
  "Console",
  "Intl",
  "Temporal",
]);

/** Regex for declaration keywords that define local identifiers. */
const LOCAL_DECL_RE =
  /\b(?:type|interface|class|enum|function|const|let|var|abstract\s+class|declare\s+class|declare\s+function|declare\s+const)\s+([A-Z][A-Za-z0-9]*)/g;

/** Regex for PascalCase identifiers. */
const PASCAL_RE = /\b([A-Z][a-z][A-Za-z0-9]*)\b/g;

/** Regex for import lines. */
const IMPORT_RE = /^\s*import\b.*$/gm;

/** Code file extensions that should be checked. */
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * Check if `newText` references PascalCase identifiers that aren't imported
 * or locally declared in `fullFileContent`.
 *
 * Returns warning strings, one per unresolved identifier.
 */
export function checkMissingImports(
  filePath: string,
  newText: string,
  fullFileContent: string,
): string[] {
  const ext = path.extname(filePath);
  if (!CODE_EXTS.has(ext)) return [];

  // Collect all imported names
  const importedNames = new Set<string>();
  for (const match of fullFileContent.matchAll(IMPORT_RE)) {
    const line = match[0];
    // Extract names from: import { Foo, Bar } or import Foo or import type { Foo }
    for (const id of line.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)) {
      importedNames.add(id[1]);
    }
  }

  // Collect locally declared PascalCase identifiers
  const localDecls = new Set<string>();
  for (const match of fullFileContent.matchAll(LOCAL_DECL_RE)) {
    localDecls.add(match[1]);
  }

  // Extract PascalCase identifiers from new_text
  const usedInNew = new Set<string>();
  for (const match of newText.matchAll(PASCAL_RE)) {
    usedInNew.add(match[1]);
  }

  const warnings: string[] = [];
  for (const id of usedInNew) {
    if (GLOBAL_IDENTIFIERS.has(id)) continue;
    if (importedNames.has(id)) continue;
    if (localDecls.has(id)) continue;
    warnings.push(
      `\u26A0 Wiring: '${id}' is used but not imported \u2014 add an import statement if needed`,
    );
  }

  return warnings;
}

/**
 * Source directory names that indicate project structure.
 */
const SOURCE_DIRS = ["src", "lib", "app"];

/**
 * Directories that are valid at project root even outside source dirs.
 */
const ALLOWED_ROOT_DIRS = new Set([
  "src",
  "lib",
  "app",
  "test",
  "tests",
  "__tests__",
  "scripts",
  ".gg",
]);

/**
 * Config file patterns at project root that should skip location warnings.
 */
const CONFIG_PATTERNS = [
  /^package\.json$/,
  /^tsconfig.*\.json$/,
  /^\.eslint/,
  /^\.prettier/,
  /^\.gitignore$/,
  /^\.git/,
  /^\.env/,
  /^\.editorconfig$/,
  /^vitest\.config/,
  /^vite\.config/,
  /^next\.config/,
  /^jest\.config/,
  /^tailwind\.config/,
  /^postcss\.config/,
  /^babel\.config/,
  /^webpack\.config/,
  /^rollup\.config/,
  /^esbuild\.config/,
  /^turbo\.json$/,
  /^pnpm-workspace/,
  /^docker/i,
  /^Dockerfile/,
  /^Makefile$/,
  /^README/i,
  /^LICENSE/i,
  /^CHANGELOG/i,
  /^CONTRIBUTING/i,
  /^\./,
];

/**
 * Check if a file is being written outside the project's source directories.
 * Returns a warning string if so, or null if the location is fine.
 */
export async function checkLocationGuard(
  cwd: string,
  filePath: string,
  ops: ToolOperations,
): Promise<string | null> {
  // Get the relative path from cwd
  const rel = path.relative(cwd, filePath);

  // Only check files directly in cwd (not nested in subdirs already)
  const parts = rel.split(path.sep);
  if (parts.length !== 1) {
    // File is in a subdirectory — check if it's under an allowed dir
    const topDir = parts[0];
    if (ALLOWED_ROOT_DIRS.has(topDir)) return null;
    // If under a source dir, fine
    if (SOURCE_DIRS.includes(topDir)) return null;
    // Otherwise still check if source dirs exist
  } else {
    // File is directly in cwd root — check if it's a config file
    const filename = parts[0];
    if (CONFIG_PATTERNS.some((p) => p.test(filename))) return null;
  }

  // Check if any source directory exists
  const existingSourceDirs: string[] = [];
  for (const dir of SOURCE_DIRS) {
    const dirPath = path.join(cwd, dir);
    const exists = await ops.stat(dirPath).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (exists) existingSourceDirs.push(dir + "/");
  }

  if (existingSourceDirs.length === 0) return null;

  // If file is in a subdirectory that's already a source dir, no warning
  if (parts.length > 1 && SOURCE_DIRS.includes(parts[0])) return null;

  // If file is in an allowed root dir, no warning
  if (parts.length > 1 && ALLOWED_ROOT_DIRS.has(parts[0])) return null;

  const srcList = existingSourceDirs.join(", ");
  return `\u26A0 Location: This file is outside the project's source directories (${srcList}). Verify this is the intended location.`;
}
