import fs from "node:fs/promises";
import path from "node:path";
import { getAppPaths } from "../../config.js";
import { log } from "../logger.js";
import type { ConfigScope, MCPServerConfig, ScopedMcpServerConfig } from "./types.js";

/**
 * Resolve the file path for a given config scope.
 *
 *   project → .mcp.json in project root (committable, shared)
 *   local   → .gg/settings.local.json (gitignored, per-machine)
 *   user    → ~/.gg/settings.json (global)
 */
export function getConfigFilePath(scope: ConfigScope, projectRoot?: string): string {
  const cwd = projectRoot ?? process.cwd();
  switch (scope) {
    case "project":
      return path.join(cwd, ".mcp.json");
    case "local":
      return path.join(cwd, ".gg", "settings.local.json");
    case "user":
      return getAppPaths().settingsFile;
  }
}

/** Read the mcpServers object from a config file. Returns empty on missing/invalid. */
async function readMcpServersFromFile(
  filePath: string,
  scope: ConfigScope,
): Promise<Record<string, MCPServerConfig>> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
    // .mcp.json has mcpServers at top level; settings.json nests under mcpServers key
    if (scope === "project") {
      return (raw?.mcpServers as Record<string, MCPServerConfig>) ?? raw ?? {};
    }
    return (raw?.mcpServers as Record<string, MCPServerConfig>) ?? {};
  } catch {
    return {};
  }
}

/** Write mcpServers back to the appropriate config file. */
async function writeMcpServersToFile(
  filePath: string,
  scope: ConfigScope,
  servers: Record<string, MCPServerConfig>,
): Promise<void> {
  let content: Record<string, unknown>;

  try {
    content = JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    content = {};
  }

  if (scope === "project") {
    // .mcp.json — mcpServers at top level
    content.mcpServers = servers;
  } else {
    // settings files — nest under mcpServers key
    content.mcpServers = servers;
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(content, null, 2) + "\n", "utf-8");
}

// ── Public API ────────────────────────────────────────────

/** Add or update an MCP server config in a specific scope. */
export async function addMcpConfig(
  name: string,
  config: Omit<MCPServerConfig, "name">,
  scope: ConfigScope,
  projectRoot?: string,
): Promise<void> {
  const filePath = getConfigFilePath(scope, projectRoot);
  const servers = await readMcpServersFromFile(filePath, scope);
  servers[name] = { name, ...config };
  await writeMcpServersToFile(filePath, scope, servers);
  log("INFO", "mcp", `Added MCP server "${name}" to ${scope} config at ${filePath}`);
}

/** Remove an MCP server from a specific scope. */
export async function removeMcpConfig(
  name: string,
  scope: ConfigScope,
  projectRoot?: string,
): Promise<void> {
  const filePath = getConfigFilePath(scope, projectRoot);
  const servers = await readMcpServersFromFile(filePath, scope);
  if (!(name in servers)) {
    throw new Error(`No MCP server "${name}" found in ${scope} config`);
  }
  delete servers[name];
  await writeMcpServersToFile(filePath, scope, servers);
  log("INFO", "mcp", `Removed MCP server "${name}" from ${scope} config`);
}

/** Get a single server config by name, searching all scopes (project > local > user). */
export function getMcpConfigByName(
  name: string,
  allConfigs: Record<string, ScopedMcpServerConfig>,
): ScopedMcpServerConfig | undefined {
  return allConfigs[name];
}

/** Get all servers for a specific scope. */
export async function getMcpConfigsByScope(
  scope: ConfigScope,
  projectRoot?: string,
): Promise<Record<string, ScopedMcpServerConfig>> {
  const filePath = getConfigFilePath(scope, projectRoot);
  const raw = await readMcpServersFromFile(filePath, scope);
  const result: Record<string, ScopedMcpServerConfig> = {};
  for (const [name, config] of Object.entries(raw)) {
    result[name] = { ...config, name, scope };
  }
  return result;
}

/**
 * Merge all scopes with precedence: project > local > user.
 * Returns a deduped record keyed by server name.
 */
export async function getAllMcpConfigs(
  projectRoot?: string,
): Promise<{ servers: Record<string, ScopedMcpServerConfig> }> {
  const user = await getMcpConfigsByScope("user");
  const local = await getMcpConfigsByScope("local", projectRoot);
  const project = await getMcpConfigsByScope("project", projectRoot);

  // Merge: later scopes override earlier (project wins)
  const servers: Record<string, ScopedMcpServerConfig> = {
    ...user,
    ...local,
    ...project,
  };

  return { servers };
}

/**
 * Find which scopes contain a server with a given name.
 * Used by `gg mcp remove` when no --scope is specified.
 */
export async function findServerScopes(
  name: string,
  projectRoot?: string,
): Promise<ConfigScope[]> {
  const scopes: ConfigScope[] = [];
  for (const scope of ["project", "local", "user"] as const) {
    const configs = await getMcpConfigsByScope(scope, projectRoot);
    if (name in configs) scopes.push(scope);
  }
  return scopes;
}
