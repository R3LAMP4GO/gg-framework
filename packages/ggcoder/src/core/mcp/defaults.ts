import type { Provider } from "@kenkaiiii/gg-ai";
import type { MCPServerConfig } from "./types.js";
import type { Settings } from "../settings-manager.js";

export const DEFAULT_MCP_SERVERS: MCPServerConfig[] = [
  { name: "grep", url: "https://mcp.grep.app" },
];

/**
 * Convert user-configured mcpServers (keyed by name) from settings.json
 * into MCPServerConfig[] for the client manager.
 */
function parseUserMCPServers(
  mcpServers?: Settings["mcpServers"],
): MCPServerConfig[] {
  if (!mcpServers) return [];
  return Object.entries(mcpServers)
    .filter(([, config]) => config.enabled !== false)
    .map(([name, config]) => ({ name, ...config }));
}

/**
 * Get MCP servers for a specific provider, merged with user-configured servers.
 * GLM models get Z.AI MCP servers for vision, web search, web reading, and GitHub exploration.
 */
export function getMCPServers(
  provider: Provider,
  apiKey?: string,
  userMCPServers?: Settings["mcpServers"],
): MCPServerConfig[] {
  const servers = [...DEFAULT_MCP_SERVERS, ...parseUserMCPServers(userMCPServers)];

  if (provider === "glm" && apiKey) {
    const zaiAuth = { Authorization: `Bearer ${apiKey}` };

    // Vision (image support via stdio MCP server)
    servers.push({
      name: "zai_vision",
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: {
        Z_AI_API_KEY: apiKey,
        Z_AI_MODE: "ZAI",
      },
      timeout: 60_000,
    });

    // Web search
    servers.push({
      name: "zai_web_search",
      url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
      headers: zaiAuth,
      timeout: 60_000,
    });

    // Web reader (full-page content extraction)
    servers.push({
      name: "zai_web_reader",
      url: "https://api.z.ai/api/mcp/web_reader/mcp",
      headers: zaiAuth,
      timeout: 60_000,
    });

    // GitHub repository exploration
    servers.push({
      name: "zai_zread",
      url: "https://api.z.ai/api/mcp/zread/mcp",
      headers: zaiAuth,
      timeout: 60_000,
    });
  }

  return servers;
}
