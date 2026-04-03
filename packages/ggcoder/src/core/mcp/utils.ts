import type { ConfigScope } from "./types.js";
import { getConfigFilePath } from "./config.js";

const VALID_SCOPES: ConfigScope[] = ["project", "local", "user"];

/** Validate and return a ConfigScope, or throw if invalid. */
export function ensureConfigScope(input: string | undefined): ConfigScope {
  const scope = input ?? "user";
  if (!VALID_SCOPES.includes(scope as ConfigScope)) {
    throw new Error(
      `Invalid scope "${scope}". Must be one of: ${VALID_SCOPES.join(", ")}`,
    );
  }
  return scope as ConfigScope;
}

/** Human-readable label for a config scope. */
export function getScopeLabel(scope: ConfigScope): string {
  switch (scope) {
    case "project":
      return "project (.mcp.json)";
    case "local":
      return "local (.gg/settings.local.json)";
    case "user":
      return "user (~/.gg/settings.json)";
  }
}

/** Resolved file path description for a config scope. */
export function describeMcpConfigFilePath(scope: ConfigScope, projectRoot?: string): string {
  return getConfigFilePath(scope, projectRoot);
}

/** Max description length for MCP tool descriptions sent to the model. */
export const MAX_MCP_DESCRIPTION_LENGTH = 2048;

/** Truncate a string to maxLen, appending "… [truncated]" if needed. */
export function truncateDescription(text: string, maxLen = MAX_MCP_DESCRIPTION_LENGTH): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 15) + "… [truncated]";
}
