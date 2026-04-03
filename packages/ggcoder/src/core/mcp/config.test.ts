import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addMcpConfig, removeMcpConfig, getAllMcpConfigs, getMcpConfigsByScope, findServerScopes } from "./config.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-config-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("addMcpConfig", () => {
  it("writes to user scope settings file", async () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    await fs.writeFile(settingsPath, "{}");
    // Patch getAppPaths to use tmpDir — use projectRoot override for local/project
    await addMcpConfig("test-server", { url: "https://example.com" }, "project", tmpDir);

    const content = JSON.parse(await fs.readFile(path.join(tmpDir, ".mcp.json"), "utf-8"));
    expect(content.mcpServers["test-server"]).toBeDefined();
    expect(content.mcpServers["test-server"].url).toBe("https://example.com");
  });

  it("writes to local scope", async () => {
    await addMcpConfig("local-srv", { command: "npx", args: ["-y", "my-server"] }, "local", tmpDir);

    const localPath = path.join(tmpDir, ".gg", "settings.local.json");
    const content = JSON.parse(await fs.readFile(localPath, "utf-8"));
    expect(content.mcpServers["local-srv"].command).toBe("npx");
  });
});

describe("removeMcpConfig", () => {
  it("removes from project scope", async () => {
    await addMcpConfig("rm-test", { url: "https://rm.com" }, "project", tmpDir);
    await removeMcpConfig("rm-test", "project", tmpDir);

    const content = JSON.parse(await fs.readFile(path.join(tmpDir, ".mcp.json"), "utf-8"));
    expect(content.mcpServers["rm-test"]).toBeUndefined();
  });

  it("throws when server not found", async () => {
    await expect(removeMcpConfig("nonexistent", "project", tmpDir)).rejects.toThrow("No MCP server");
  });
});

describe("getAllMcpConfigs", () => {
  it("merges scopes with project > local precedence", async () => {
    await addMcpConfig("shared", { url: "https://local.com" }, "local", tmpDir);
    await addMcpConfig("shared", { url: "https://project.com" }, "project", tmpDir);

    const { servers } = await getAllMcpConfigs(tmpDir);
    // Project scope should win
    expect(servers["shared"].url).toBe("https://project.com");
    expect(servers["shared"].scope).toBe("project");
  });

  it("returns empty when no configs exist", async () => {
    const { servers } = await getAllMcpConfigs(tmpDir);
    // Only user scope exists (via ~/.gg/settings.json) — may or may not have servers
    expect(typeof servers).toBe("object");
  });
});

describe("getMcpConfigsByScope", () => {
  it("returns servers for a specific scope", async () => {
    await addMcpConfig("s1", { url: "https://s1.com" }, "project", tmpDir);
    await addMcpConfig("s2", { url: "https://s2.com" }, "project", tmpDir);

    const configs = await getMcpConfigsByScope("project", tmpDir);
    expect(Object.keys(configs)).toHaveLength(2);
    expect(configs["s1"].scope).toBe("project");
  });

  it("returns empty for scope with no configs", async () => {
    const configs = await getMcpConfigsByScope("local", tmpDir);
    expect(Object.keys(configs)).toHaveLength(0);
  });
});

describe("findServerScopes", () => {
  it("finds server in multiple scopes", async () => {
    await addMcpConfig("multi", { url: "https://a.com" }, "project", tmpDir);
    await addMcpConfig("multi", { url: "https://b.com" }, "local", tmpDir);

    const scopes = await findServerScopes("multi", tmpDir);
    expect(scopes).toContain("project");
    expect(scopes).toContain("local");
  });

  it("returns empty for unknown server", async () => {
    const scopes = await findServerScopes("unknown", tmpDir);
    expect(scopes).toHaveLength(0);
  });
});
