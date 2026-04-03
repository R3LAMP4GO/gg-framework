/**
 * MCP server management overlay — CC-style interactive UI.
 * Shows connected servers with status, allows enable/disable/reconnect.
 */
import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

export interface MCPServerInfo {
  name: string;
  status: "connected" | "disabled" | "failed" | "connecting";
  toolCount: number;
  type: "stdio" | "http" | "sse" | "unknown";
  url?: string;
  command?: string;
}

interface MCPOverlayProps {
  servers: MCPServerInfo[];
  onClose: () => void;
  onToggle?: (name: string, enabled: boolean) => void;
  onReconnect?: (name: string) => void;
}

const STATUS_ICONS: Record<MCPServerInfo["status"], { icon: string; color: string }> = {
  connected: { icon: "✓", color: "green" },
  disabled: { icon: "○", color: "gray" },
  failed: { icon: "✗", color: "red" },
  connecting: { icon: "⟳", color: "yellow" },
};

export function MCPOverlay({ servers, onClose, onToggle, onReconnect }: MCPOverlayProps) {
  const theme = useTheme();
  useTerminalSize(); // Keep for future responsive layout
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<"list" | "detail">("list");
  const [detailServer, setDetailServer] = useState<MCPServerInfo | null>(null);

  // Clamp index
  useEffect(() => {
    if (servers.length > 0 && selectedIndex >= servers.length) {
      setSelectedIndex(servers.length - 1);
    }
  }, [servers.length, selectedIndex]);

  useInput((input, key) => {
    if (view === "detail") {
      if (key.escape || input === "q") {
        setView("list");
        setDetailServer(null);
        return;
      }
      if (input === "e" && detailServer) {
        onToggle?.(detailServer.name, detailServer.status === "disabled");
        return;
      }
      if (input === "r" && detailServer) {
        onReconnect?.(detailServer.name);
        return;
      }
      return;
    }

    // List view
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(servers.length - 1, i + 1));
      return;
    }

    if (key.return) {
      const server = servers[selectedIndex];
      if (server) {
        setDetailServer(server);
        setView("detail");
      }
      return;
    }

    // Quick toggle
    if (input === "e") {
      const server = servers[selectedIndex];
      if (server) {
        onToggle?.(server.name, server.status === "disabled");
      }
      return;
    }

    if (input === "r") {
      const server = servers[selectedIndex];
      if (server) {
        onReconnect?.(server.name);
      }
      return;
    }
  });

  // ── Detail view ──
  if (view === "detail" && detailServer) {
    const si = STATUS_ICONS[detailServer.status];
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.planPrimary} bold>
          {"MCP Server: "}
          {detailServer.name}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text dimColor>{"  Status:  "}</Text>
            <Text color={si.color}>
              {si.icon} {detailServer.status}
            </Text>
          </Box>
          <Box>
            <Text dimColor>{"  Type:    "}</Text>
            <Text>{detailServer.type}</Text>
          </Box>
          <Box>
            <Text dimColor>{"  Tools:   "}</Text>
            <Text>{detailServer.toolCount}</Text>
          </Box>
          {detailServer.url && (
            <Box>
              <Text dimColor>{"  URL:     "}</Text>
              <Text>{detailServer.url}</Text>
            </Box>
          )}
          {detailServer.command && (
            <Box>
              <Text dimColor>{"  Command: "}</Text>
              <Text>{detailServer.command}</Text>
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            <Text color={theme.planPrimary}>e</Text>
            {detailServer.status === "disabled" ? " enable" : " disable"}
            {" · "}
            <Text color={theme.planPrimary}>r</Text>
            {" reconnect · "}
            <Text color={theme.planPrimary}>ESC</Text>
            {" back"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── List view ──
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.planPrimary} bold>
        {"MCP Servers"}
      </Text>
      <Text dimColor>
        {servers.length} server{servers.length !== 1 ? "s" : ""} configured
      </Text>

      {servers.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>
            {"No MCP servers configured. Add one with: "}
            <Text color={theme.planPrimary}>ggcoder mcp add</Text>
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {servers.map((server, i) => {
            const selected = i === selectedIndex;
            const si = STATUS_ICONS[server.status];
            const pointer = selected ? "❯ " : "  ";

            return (
              <Box key={server.name}>
                <Text color={selected ? theme.planPrimary : theme.textDim}>{pointer}</Text>
                <Text color={si.color}>{si.icon} </Text>
                <Text color={selected ? theme.text : theme.textDim} bold={selected}>
                  {server.name}
                </Text>
                <Text dimColor>
                  {" ("}
                  {server.status}
                  {") → "}
                  {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          <Text color={theme.planPrimary}>↑↓</Text>
          {" move · "}
          <Text color={theme.planPrimary}>Enter</Text>
          {" detail · "}
          <Text color={theme.planPrimary}>e</Text>
          {" toggle · "}
          <Text color={theme.planPrimary}>r</Text>
          {" reconnect · "}
          <Text color={theme.planPrimary}>ESC</Text>
          {" close"}
        </Text>
      </Box>
    </Box>
  );
}
