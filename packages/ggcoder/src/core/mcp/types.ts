/** Transport type for MCP server connections */
export type MCPTransportType = "stdio" | "sse" | "http";

/** Configuration scopes — project > local > user precedence */
export type ConfigScope = "project" | "local" | "user";

export interface MCPServerConfig {
  name: string;
  /** Transport type (inferred from url/command if not set) */
  type?: MCPTransportType;
  /** Streamable HTTP endpoint URL */
  url?: string;
  headers?: Record<string, string>;
  /** Stdio server: command to spawn */
  command?: string;
  /** Stdio server: command arguments */
  args?: string[];
  /** Stdio server: environment variables */
  env?: Record<string, string>;
  timeout?: number;
  enabled?: boolean;
}

/** MCPServerConfig with scope metadata attached */
export interface ScopedMcpServerConfig extends MCPServerConfig {
  scope: ConfigScope;
}

/** Metadata about a discovered MCP tool (for system prompt injection) */
export interface MCPToolMeta {
  name: string;
  description: string;
  serverName: string;
  readOnly?: boolean;
  destructive?: boolean;
}
