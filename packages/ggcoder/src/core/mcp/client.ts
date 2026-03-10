import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { z } from "zod";
import { log } from "../logger.js";
import type { MCPServerConfig, ElicitationHandler } from "./types.js";

interface ConnectedServer {
  name: string;
  client: Client;
  transport: StreamableHTTPClientTransport;
}

export class MCPClientManager {
  private servers: ConnectedServer[] = [];
  private elicitationHandler: ElicitationHandler | null = null;

  /** Register a handler for MCP elicitation/create requests */
  setElicitationHandler(handler: ElicitationHandler | null): void {
    this.elicitationHandler = handler;
  }

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
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });

    const client = new Client(
      { name: "ggcoder", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    const timeout = config.timeout ?? 30_000;

    // Register elicitation handler before connecting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).setRequestHandler?.(
      { method: "elicitation/create" },
      async (request: { params?: { message?: string; requestedSchema?: unknown; mode?: string } }) => {
        if (!this.elicitationHandler) {
          return { action: "cancel" as const };
        }
        const params = request.params ?? {};
        try {
          const result = await this.elicitationHandler({
            message: String(params.message ?? ""),
            requestedSchema: params.requestedSchema as ElicitationHandler extends (p: infer P) => unknown ? P extends { requestedSchema?: infer S } ? S : undefined : undefined,
          });
          return {
            action: result.action,
            content: result.content,
          };
        } catch (err) {
          log("ERROR", "mcp", `Elicitation handler error: ${err instanceof Error ? err.message : String(err)}`);
          return { action: "cancel" as const };
        }
      },
    );

    await client.connect(transport, { timeout });
    this.servers.push({ name: config.name, client, transport });

    const { tools } = await client.listTools(undefined, { timeout });

    return tools.map((tool): AgentTool => {
      const toolName = `mcp__${config.name}__${tool.name}`;
      return {
        name: toolName,
        description: tool.description ?? "",
        parameters: z.record(z.string(), z.unknown()),
        rawInputSchema: tool.inputSchema as Record<string, unknown>,
        execute: async (args) => {
          try {
            const result = await client.callTool(
              { name: tool.name, arguments: args as Record<string, unknown> },
              undefined,
              { timeout },
            );
            if (!("content" in result) || !Array.isArray(result.content)) {
              return "(empty response)";
            }
            const texts: string[] = [];
            for (const item of result.content) {
              if (
                item != null &&
                typeof item === "object" &&
                "text" in item &&
                typeof item.text === "string"
              ) {
                texts.push(item.text);
              }
            }
            return texts.join("\n") || "(empty response)";
          } catch (err) {
            return `MCP tool error: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      };
    });
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
  }
}
