export interface MCPServerConfig {
  name: string;
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

/**
 * Handler for MCP elicitation/create requests.
 * Routes MCP server questions through the UI.
 */
export type ElicitationHandler = (params: {
  message: string;
  requestedSchema?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}) => Promise<{
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}>;
