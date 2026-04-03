import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { z } from "zod";
import { log } from "../logger.js";
import type { MCPServerConfig, MCPToolMeta } from "./types.js";
import { truncateDescription } from "./utils.js";

interface ConnectedServer {
  name: string;
  client: Client;
  transport: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;
  lastCallTime: number;
}

export class MCPClientManager {
  private servers: ConnectedServer[] = [];
  /** Metadata about discovered tools — used for system prompt injection */
  public toolMeta: MCPToolMeta[] = [];

  async connectAll(configs: MCPServerConfig[]): Promise<AgentTool[]> {
    const enabled = configs.filter((c) => c.enabled !== false);
    if (enabled.length === 0) return [];

    const results = await Promise.allSettled(enabled.map((c) => this.connectServer(c)));

    const tools: AgentTool[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        tools.push(...result.value);
      } else {
        log("WARN", "mcp", `Failed to connect to MCP server "${enabled[i].name}"`, {
          error: String(result.reason),
        });
      }
    }

    log("INFO", "mcp", `Connected ${this.servers.length} MCP server(s), ${tools.length} tool(s)`);
    return tools;
  }

  private async connectServer(config: MCPServerConfig): Promise<AgentTool[]> {
    const timeout = config.timeout ?? 30_000;
    let client: Client;
    let transport: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;

    if (config.command) {
      // Stdio transport for local processes
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env } as Record<string, string>,
        stderr: "pipe",
      });
      client = new Client({ name: "ggcoder", version: "1.0.0" });
      await client.connect(transport, { timeout });
    } else {
      // HTTP transport — try StreamableHTTP first, fall back to SSE
      const url = new URL(config.url!);
      const reqInit = config.headers ? { headers: config.headers } : undefined;

      try {
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: reqInit,
        });
        client = new Client({ name: "ggcoder", version: "1.0.0" });
        await client.connect(transport, { timeout });
      } catch (streamableErr) {
        log("INFO", "mcp", `StreamableHTTP failed for "${config.name}", trying SSE fallback`, {
          error: String(streamableErr),
        });
        transport = new SSEClientTransport(url, {
          eventSourceInit: config.headers
            ? { fetch: createHeaderFetch(config.headers) }
            : undefined,
          requestInit: reqInit,
        });
        client = new Client({ name: "ggcoder", version: "1.0.0" });
        await client.connect(transport, { timeout });
      }
    }

    this.servers.push({ name: config.name, client, transport, lastCallTime: 0 });

    const { tools } = await client.listTools(undefined, { timeout });

    return tools.map((tool): AgentTool => {
      const toolName = `mcp__${config.name}__${tool.name}`;

      // ── Description enrichment (CC parity) ──
      // Extract annotations from tool metadata
      const meta = (tool as Record<string, unknown>)._meta as Record<string, unknown> | undefined;
      const searchHint = meta?.["anthropic/searchHint"] as string | undefined;
      const isReadOnly = meta?.readOnlyHint === true;
      const isDestructive = meta?.destructiveHint === true;

      let description = tool.description ?? "";
      // Prefix with safety tags
      if (isReadOnly) description = `[read-only] ${description}`;
      if (isDestructive) description = `[destructive] ${description}`;
      // Append search hint if present
      if (searchHint) description += `\nSearch hint: ${searchHint}`;
      // Truncate to prevent context bloat
      description = truncateDescription(description);

      // Track metadata for system prompt injection
      this.toolMeta.push({
        name: toolName,
        description: description.slice(0, 200),
        serverName: config.name,
        readOnly: isReadOnly || undefined,
        destructive: isDestructive || undefined,
      });

      return {
        name: toolName,
        description,
        parameters: z.record(z.string(), z.unknown()),
        rawInputSchema: tool.inputSchema as Record<string, unknown>,
        execute: async (args) => {
          const server = this.servers.find((s) => s.name === config.name);
          if (server) {
            const elapsed = Date.now() - server.lastCallTime;
            const minGap = 2_000;
            if (elapsed < minGap) {
              await new Promise((r) => setTimeout(r, minGap - elapsed));
            }
            server.lastCallTime = Date.now();
          }

          try {
            const result = await client.callTool(
              { name: tool.name, arguments: args as Record<string, unknown> },
              undefined,
              { timeout: config.timeout ?? 60_000 },
            );
            if (!("content" in result) || !Array.isArray(result.content)) {
              return "(empty response)";
            }
            const parts: string[] = [];
            for (const item of result.content) {
              if (item == null || typeof item !== "object") continue;
              if ("text" in item && typeof item.text === "string") {
                parts.push(item.text);
              } else if ("type" in item && item.type === "resource" && "resource" in item) {
                // Structured content — stringify for model consumption
                parts.push(JSON.stringify(item.resource, null, 2));
              }
            }
            // Handle structuredContent field (MCP extension)
            const resultAny = result as Record<string, unknown>;
            if (resultAny.structuredContent != null) {
              parts.push(JSON.stringify(resultAny.structuredContent, null, 2));
            }
            return parts.join("\n") || "(empty response)";
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Too Many R") || msg.includes("429")) {
              return "Rate limited — too many requests. Wait a moment before searching again.";
            }
            // Session expiration — hint at reconnection
            if (msg.includes("404") || msg.includes("-32001")) {
              return `MCP session expired for ${config.name}. The server connection may need to be re-established.`;
            }
            return `MCP tool error: ${msg}`;
          }
        },
      };
    });
  }

  /** Check if a server is reachable. Returns status string. */
  async checkHealth(
    name: string,
    config: MCPServerConfig,
  ): Promise<"connected" | "failed" | "error"> {
    try {
      const timeout = config.timeout ?? 15_000;
      let client: Client;
      let transport: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;

      if (config.command) {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...process.env, ...config.env } as Record<string, string>,
          stderr: "pipe",
        });
        client = new Client({ name: "ggcoder-health", version: "1.0.0" });
      } else {
        const url = new URL(config.url!);
        const reqInit = config.headers ? { headers: config.headers } : undefined;
        transport = new StreamableHTTPClientTransport(url, { requestInit: reqInit });
        client = new Client({ name: "ggcoder-health", version: "1.0.0" });
      }

      await client.connect(transport, { timeout });
      await client.close();
      return "connected";
    } catch {
      return "failed";
    }
  }

  async dispose(): Promise<void> {
    for (const server of this.servers) {
      try {
        await server.client.close();
      } catch {
        // Ignore close errors
      }
    }
    this.servers = [];
    this.toolMeta = [];
  }
}

/**
 * Create a custom fetch wrapper that injects extra headers into every request.
 * Used for SSEClientTransport's eventSourceInit to pass auth headers
 * on the initial SSE GET connection (which doesn't use requestInit).
 */
function createHeaderFetch(extraHeaders: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (url: string | URL, init: any): Promise<Response> => {
    const existing = (init?.headers ?? {}) as Record<string, string>;
    return fetch(url, { ...init, headers: { ...existing, ...extraHeaders } });
  };
}
