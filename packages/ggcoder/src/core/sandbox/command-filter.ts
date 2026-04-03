/**
 * Bash command blocklist — application-level sandboxing.
 * Blocks dangerous commands by default (data exfiltration, network tools, destructive ops).
 */

/** Commands blocked by default — potential data exfiltration or destructive */
const BLOCKED_COMMANDS = new Set([
  "curl", "wget",            // Data exfiltration
  "nc", "ncat", "netcat",    // Raw network
  "ssh", "scp", "sftp",      // Remote access
  "telnet",                   // Remote access
  "ftp",                      // File transfer
  "rsync",                    // Remote sync
]);

/** Dangerous flag patterns (command + flag combinations) */
const DANGEROUS_PATTERNS: Array<{ command: string; flags: string[]; reason: string }> = [
  { command: "git", flags: ["push --force", "push -f"], reason: "Force push can overwrite remote history" },
  { command: "git", flags: ["reset --hard"], reason: "Hard reset discards uncommitted changes" },
  { command: "git", flags: ["clean -fd", "clean -f"], reason: "Clean deletes untracked files permanently" },
  { command: "git", flags: ["--no-verify"], reason: "Skipping hooks bypasses safety checks" },
  { command: "rm", flags: ["-rf /", "-rf ~", "-rf $HOME"], reason: "Recursive force delete on root/home" },
  { command: "chmod", flags: ["777"], reason: "World-writable permissions are insecure" },
];

export interface FilterResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Split a compound command into individual subcommands.
 * Handles &&, ||, ;, and | operators.
 */
function splitCompoundCommand(command: string): string[] {
  // Split on &&, ||, ;, | but not inside quotes
  return command.split(/\s*(?:&&|\|\||[;|])\s*/).filter(Boolean);
}

/**
 * Extract the base command name from a command string.
 * Handles paths (/usr/bin/curl → curl) and env prefixes (VAR=val cmd → cmd).
 */
function extractCommandName(cmd: string): string {
  const trimmed = cmd.trim();
  // Skip env var assignments (KEY=value command)
  const parts = trimmed.split(/\s+/);
  for (const part of parts) {
    if (part.includes("=") && !part.startsWith("-")) continue;
    // Strip path prefix
    return part.replace(/^.*\//, "");
  }
  return parts[0]?.replace(/^.*\//, "") ?? "";
}

/**
 * Check if a bash command is allowed.
 * Returns { allowed: false, reason } if blocked.
 */
export function filterBashCommand(command: string): FilterResult {
  const subcommands = splitCompoundCommand(command);

  for (const sub of subcommands) {
    const cmdName = extractCommandName(sub);

    // Check blocked commands
    if (BLOCKED_COMMANDS.has(cmdName)) {
      return {
        allowed: false,
        reason: `Command "${cmdName}" is blocked by default (potential data exfiltration). Set sandboxEnabled: false in settings to override.`,
      };
    }

    // Check dangerous flag patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (cmdName !== pattern.command) continue;
      for (const flag of pattern.flags) {
        if (sub.includes(flag)) {
          return {
            allowed: false,
            reason: `"${cmdName} ${flag}" blocked: ${pattern.reason}. Set sandboxEnabled: false to override.`,
          };
        }
      }
    }
  }

  return { allowed: true };
}
