export interface MCPServerConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  enabled?: boolean;
}

/**
 * Handler for MCP elicitation/create requests.
 * Routes MCP server questions through the UI's QuestionOverlay.
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
