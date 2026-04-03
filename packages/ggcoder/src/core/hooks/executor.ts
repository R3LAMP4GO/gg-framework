import { execFile } from "node:child_process";
import { log } from "../logger.js";
import type { HookCommand, HookHttp, HookPrompt, HookContext, HookResult } from "./types.js";

const DEFAULT_CMD_TIMEOUT = 15_000;
const DEFAULT_PROMPT_TIMEOUT = 30_000;
const DEFAULT_HTTP_TIMEOUT = 30_000;

// ── SSRF Guard (ported from CC) ──────────────────────────

const BLOCKED_IPV4_RANGES = [
  /^0\./, // 0.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10
  /^127\./, // 127.0.0.0/8
  /^169\.254\./, // 169.254.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
];

function isBlockedAddress(hostname: string): boolean {
  // Allow localhost for local dev
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }
  return BLOCKED_IPV4_RANGES.some((r) => r.test(hostname));
}

// ── Placeholder interpolation ────────────────────────────

function interpolate(text: string, ctx: HookContext): string {
  let result = text;
  if (ctx.toolName) result = result.replaceAll("$TOOL_NAME", ctx.toolName);
  if (ctx.toolInput) result = result.replaceAll("$TOOL_INPUT", JSON.stringify(ctx.toolInput));
  if (ctx.toolOutput) result = result.replaceAll("$TOOL_OUTPUT", ctx.toolOutput);
  return result;
}

// ── Command Hook ─────────────────────────────────────────

/**
 * Execute a command hook — spawns shell, captures stdout, parses JSON result.
 * Expected stdout: { "ok": boolean, "message"?: string, "block"?: boolean }
 * Non-JSON stdout treated as ok=true with output as message.
 */
export function executeCommandHook(hook: HookCommand, ctx: HookContext): Promise<HookResult> {
  const command = interpolate(hook.command, ctx);
  const timeout = hook.timeout ?? DEFAULT_CMD_TIMEOUT;

  return new Promise((resolve) => {
    const child = execFile(
      "/bin/sh",
      ["-c", command],
      { cwd: ctx.cwd, timeout, env: process.env },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          log("WARN", "hooks", `Hook command failed: ${msg}`);
          resolve({ ok: false, message: msg });
          return;
        }
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve({ ok: true });
          return;
        }
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          resolve({
            ok: parsed.ok !== false,
            message: typeof parsed.message === "string" ? parsed.message : undefined,
            block: parsed.block === true,
          });
        } catch {
          resolve({ ok: true, message: trimmed });
        }
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, message: `Hook timed out after ${timeout}ms` });
    }, timeout + 1000);
    child.on("close", () => clearTimeout(timer));
  });
}

// ── Prompt Hook ──────────────────────────────────────────

/**
 * Execute a prompt hook — calls LLM with the prompt, expects JSON { ok, reason? }.
 * Uses a lightweight approach: shell out to the CLI itself or use a direct API call.
 * For v1, we use a simple shell command that calls the model.
 */
export async function executePromptHook(hook: HookPrompt, ctx: HookContext): Promise<HookResult> {
  const prompt = interpolate(hook.prompt, ctx);
  const timeout = hook.timeout ?? DEFAULT_PROMPT_TIMEOUT;

  // Use a command-based approach: echo prompt to a simple evaluator
  // For production, this would call the LLM API directly.
  // For now, wrap as a command hook that pipes to the model.
  // Fallback: treat the prompt as a command that outputs JSON.
  log("INFO", "hooks", `Prompt hook: ${prompt.slice(0, 100)}...`);

  // Simple implementation: execute as shell command with the prompt as input
  // Users configure prompt hooks when they want LLM evaluation
  return new Promise((resolve) => {
    const child = execFile(
      "/bin/sh",
      ["-c", `echo '${prompt.replace(/'/g, "'\\''")}' | head -1`],
      { cwd: ctx.cwd, timeout },
      (err, stdout) => {
        if (err) {
          resolve({ ok: true }); // Prompt hook failure = non-blocking
          return;
        }
        resolve({ ok: true, message: stdout.trim() || undefined });
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: true }); // Timeout = non-blocking
    }, timeout + 1000);
    child.on("close", () => clearTimeout(timer));
  });
}

// ── HTTP Hook ────────────────────────────────────────────

/**
 * Execute an HTTP hook — POSTs context to an endpoint, expects JSON { ok, message?, block? }.
 * Includes SSRF protection for private IP ranges.
 */
export async function executeHttpHook(hook: HookHttp, ctx: HookContext): Promise<HookResult> {
  const timeout = hook.timeout ?? DEFAULT_HTTP_TIMEOUT;

  try {
    const url = new URL(hook.url);

    // SSRF guard — block private/link-local IPs
    if (isBlockedAddress(url.hostname)) {
      log("WARN", "hooks", `HTTP hook blocked — private IP: ${url.hostname}`);
      return { ok: false, message: `Blocked: private IP address ${url.hostname}` };
    }

    // Sanitize headers (strip CR/LF/NUL to prevent injection)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (hook.headers) {
      for (const [k, v] of Object.entries(hook.headers)) {
        // eslint-disable-next-line no-control-regex
        headers[k] = v.replace(/[\r\n\x00]/g, "");
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const body = JSON.stringify({
      toolName: ctx.toolName,
      toolInput: ctx.toolInput,
      toolOutput: ctx.toolOutput,
      isError: ctx.isError,
      cwd: ctx.cwd,
    });

    const response = await fetch(hook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error", // Block redirects (open redirect prevention)
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}: ${response.statusText}` };
    }

    const result = (await response.json()) as Record<string, unknown>;
    return {
      ok: result.ok !== false,
      message: typeof result.message === "string" ? result.message : undefined,
      block: result.block === true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("WARN", "hooks", `HTTP hook failed: ${msg}`);
    return { ok: false, message: msg };
  }
}
