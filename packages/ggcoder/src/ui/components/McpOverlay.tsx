import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import type { MCPClientManager } from "../../core/mcp/index.js";
import type { MCPServerStatus } from "../../core/mcp/client.js";
import type { MCPServerConfig } from "../../core/mcp/index.js";
import { DEFAULT_MCP_SERVERS } from "../../core/mcp/index.js";
import type { Provider } from "@kenkaiiii/gg-ai";

// ── Types ────────────────────────────────────────────────

interface ServerGroup {
  label: string;
  subtitle?: string;
  servers: MCPServerStatus[];
}

// ── Component ────────────────────────────────────────────

export interface McpOverlayProps {
  mcpManager: MCPClientManager;
  provider: Provider;
  onClose: () => void;
}

export function McpOverlay({ mcpManager, provider, onClose }: McpOverlayProps) {
  const theme = useTheme();

  const statuses = mcpManager.getServerStatuses();
  const totalCount = statuses.length;

  // ── Group servers by source ──

  const defaultNames = new Set(DEFAULT_MCP_SERVERS.map((s) => s.name));

  const groups: ServerGroup[] = [];

  // Default MCPs
  const defaultServers = statuses.filter((s) => defaultNames.has(s.config.name));
  if (defaultServers.length > 0) {
    groups.push({
      label: "Default MCPs",
      subtitle: "built-in servers",
      servers: defaultServers,
    });
  }

  // Provider-specific MCPs
  const providerServers = statuses.filter(
    (s) => !defaultNames.has(s.config.name) && isProviderServer(s.config),
  );
  if (providerServers.length > 0) {
    const providerLabel = provider === "glm" ? "Z.AI" : String(provider);
    groups.push({
      label: `${providerLabel} MCPs`,
      subtitle: `provider: ${provider}`,
      servers: providerServers,
    });
  }

  // User MCPs (any remaining — from extensions, config, etc.)
  const userServers = statuses.filter(
    (s) => !defaultNames.has(s.config.name) && !isProviderServer(s.config),
  );
  if (userServers.length > 0) {
    groups.push({
      label: "User MCPs",
      subtitle: "~/.gg/settings.json",
      servers: userServers,
    });
  }

  // Build flat list for cursor navigation
  const flatItems: MCPServerStatus[] = [];
  for (const group of groups) {
    flatItems.push(...group.servers);
  }

  const [cursor, setCursor] = useState(0);

  // ── Keyboard ──

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(flatItems.length - 1, c + 1));
      return;
    }
  });

  // ── Status icon helper ──

  function getStatusDisplay(status: MCPServerStatus): React.ReactNode {
    switch (status.status) {
      case "connected":
        return (
          <Text>
            <Text color={theme.success}>✓</Text>
            <Text color={theme.success}> connected</Text>
          </Text>
        );
      case "failed": {
        const isAuthError =
          status.error?.includes("401") ||
          status.error?.includes("403") ||
          status.error?.toLowerCase().includes("auth") ||
          status.error?.toLowerCase().includes("unauthorized");
        if (isAuthError) {
          return (
            <Text>
              <Text color={theme.warning}>⚠</Text>
              <Text color={theme.warning}> needs authentication</Text>
            </Text>
          );
        }
        return (
          <Text>
            <Text color={theme.error}>✗</Text>
            <Text color={theme.error}> failed</Text>
          </Text>
        );
      }
      case "disabled":
        return (
          <Text>
            <Text color={theme.textDim}>○</Text>
            <Text color={theme.textDim}> disabled</Text>
          </Text>
        );
    }
  }

  // ── Render ──

  let flatIdx = 0;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text color={theme.text} bold>
          {"  Manage MCP servers"}
        </Text>
        <Text color={theme.textDim}>
          {"  "}
          {totalCount} server{totalCount !== 1 ? "s" : ""}
        </Text>
      </Box>

      {/* Server groups */}
      {groups.map((group) => (
        <Box key={group.label} flexDirection="column" marginBottom={1}>
          {/* Group header */}
          <Box>
            <Text color={theme.text} bold>
              {"  "}
              {group.label}
            </Text>
            {group.subtitle && (
              <Text color={theme.textDim}>
                {" "}
                ({group.subtitle})
              </Text>
            )}
          </Box>

          {/* Servers in group */}
          {group.servers.map((serverStatus) => {
            const idx = flatIdx++;
            const selected = idx === cursor;
            const prefix = selected ? "❯ " : "  ";

            return (
              <Box key={serverStatus.config.name}>
                <Text color={selected ? theme.primary : theme.text} bold={selected}>
                  {prefix}
                  {serverStatus.config.name}
                </Text>
                <Text> · </Text>
                {getStatusDisplay(serverStatus)}
              </Box>
            );
          })}
        </Box>
      ))}

      {/* Empty state */}
      {totalCount === 0 && (
        <Box marginBottom={1}>
          <Text color={theme.textDim}>{"  No MCP servers configured."}</Text>
        </Box>
      )}

      {/* Help link */}
      <Box marginTop={0} marginBottom={1}>
        <Text color={theme.textDim}>{"  https://docs.ggcoder.dev/mcp for help"}</Text>
      </Box>

      {/* Footer */}
      <Box>
        <Text color={theme.textDim}>
          {"  "}
          <Text color={theme.primary}>↑↓</Text>
          {" to navigate · "}
          <Text color={theme.primary}>Enter</Text>
          {" to confirm · "}
          <Text color={theme.primary}>Esc</Text>
          {" to cancel"}
        </Text>
      </Box>
    </Box>
  );
}

// ── Helpers ──

/** Check if a server config looks like a provider-injected server (Z.AI etc.) */
function isProviderServer(config: MCPServerConfig): boolean {
  const name = config.name.toLowerCase();
  return (
    name.startsWith("zai_") ||
    (config.url?.includes("z.ai") ?? false) ||
    (config.url?.includes("api.z.ai") ?? false)
  );
}
