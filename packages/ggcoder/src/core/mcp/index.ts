export { MCPClientManager } from "./client.js";
export { DEFAULT_MCP_SERVERS, getMCPServers } from "./defaults.js";
export {
  addMcpConfig,
  removeMcpConfig,
  getMcpConfigByName,
  getMcpConfigsByScope,
  getAllMcpConfigs,
  findServerScopes,
  getConfigFilePath,
} from "./config.js";
export {
  ensureConfigScope,
  getScopeLabel,
  describeMcpConfigFilePath,
  truncateDescription,
  MAX_MCP_DESCRIPTION_LENGTH,
} from "./utils.js";
export type {
  MCPServerConfig,
  ScopedMcpServerConfig,
  MCPToolMeta,
  ConfigScope,
  MCPTransportType,
} from "./types.js";
