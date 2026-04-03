/**
 * Background tasks overlay — shows running processes with kill option.
 * Ported from CC's BackgroundTasksDialog pattern.
 *
 * Down-arrow from main UI opens this. 'x' key kills selected task.
 */
import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme/theme.js";
import type { ProcessManager, BackgroundProcess } from "../../core/process-manager.js";

interface BackgroundTasksOverlayProps {
  processManager: ProcessManager;
  onClose: () => void;
}

function formatAge(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

export function BackgroundTasksOverlay({ processManager, onClose }: BackgroundTasksOverlayProps) {
  const theme = useTheme();
  const [processes, setProcesses] = useState<BackgroundProcess[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [killConfirm, setKillConfirm] = useState(false);

  // Refresh process list
  useEffect(() => {
    const refresh = () => setProcesses(processManager.list());
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [processManager]);

  // Clamp index
  useEffect(() => {
    if (processes.length > 0 && selectedIndex >= processes.length) {
      setSelectedIndex(processes.length - 1);
    }
  }, [processes.length, selectedIndex]);

  useInput((input, key) => {
    if (killConfirm) {
      if (input === "y" || input === "Y") {
        const proc = processes[selectedIndex];
        if (proc && proc.exitCode === null) {
          processManager.stop(proc.id).catch(() => {});
        }
        setKillConfirm(false);
        return;
      }
      setKillConfirm(false);
      return;
    }

    if (key.escape || input === "q") {
      onClose();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(processes.length - 1, i + 1));
      return;
    }

    // 'x' to kill selected running process
    if (input === "x") {
      const proc = processes[selectedIndex];
      if (proc && proc.exitCode === null) {
        setKillConfirm(true);
      }
      return;
    }
  });

  const running = processes.filter((p) => p.exitCode === null);
  const completed = processes.filter((p) => p.exitCode !== null);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.planPrimary} bold>
        Background Tasks
      </Text>
      <Text dimColor>
        {running.length} running · {completed.length} completed
      </Text>

      {processes.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No background tasks. Use bash with run_in_background=true to start one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {processes.map((proc, i) => {
            const selected = i === selectedIndex;
            const isRunning = proc.exitCode === null;
            const pointer = selected ? "❯ " : "  ";
            const statusIcon = isRunning ? "●" : proc.exitCode === 0 ? "✓" : "✗";
            const statusColor = isRunning ? "yellow" : proc.exitCode === 0 ? "green" : "red";

            return (
              <Box key={proc.id} flexDirection="column">
                <Box>
                  <Text color={selected ? theme.planPrimary : theme.textDim}>{pointer}</Text>
                  <Text color={statusColor}>{statusIcon} </Text>
                  <Text color={selected ? theme.text : theme.textDim} bold={selected}>
                    {proc.id}
                  </Text>
                  <Text dimColor>
                    {" "}
                    {proc.command.length > 40 ? proc.command.slice(0, 37) + "..." : proc.command}
                    {" · "}
                    {formatAge(proc.startedAt)}
                    {!isRunning && ` · exit ${proc.exitCode}`}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {killConfirm && (
        <Box marginTop={1}>
          <Text color={theme.error}>
            Kill process {processes[selectedIndex]?.id}? (y/N)
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          <Text color={theme.planPrimary}>↑↓</Text>
          {" move · "}
          <Text color={theme.error}>x</Text>
          {" kill · "}
          <Text color={theme.planPrimary}>ESC</Text>
          {" close"}
        </Text>
      </Box>
    </Box>
  );
}
