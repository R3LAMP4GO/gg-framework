import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseSkillFile } from "./skills.js";

export interface CustomCommand {
  name: string;
  description: string;
  prompt: string;
  filePath: string;
}

/**
 * Load .md files from a single commands directory.
 */
async function loadCommandsFromDir(dir: string, sourceLabel: string): Promise<CustomCommand[]> {
  const commands: CustomCommand[] = [];

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return commands;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const filePath = path.join(dir, file);

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = parseSkillFile(raw, sourceLabel);
      const name = parsed.name || path.basename(file, ".md");
      commands.push({
        name,
        description:
          parsed.description || `Custom command from ${sourceLabel} .gg/commands/${file}`,
        prompt: parsed.content,
        filePath,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return commands;
}

/**
 * Load custom slash commands from both ~/.gg/commands/*.md (global) and
 * {cwd}/.gg/commands/*.md (project-local).
 *
 * Project-local commands override global commands with the same name.
 */
export async function loadCustomCommands(cwd: string): Promise<CustomCommand[]> {
  const globalDir = path.join(os.homedir(), ".gg", "commands");
  const projectDir = path.join(cwd, ".gg", "commands");

  const [globalCmds, projectCmds] = await Promise.all([
    loadCommandsFromDir(globalDir, "global"),
    loadCommandsFromDir(projectDir, "project"),
  ]);

  // Deduplicate by name — project-local wins over global
  const seen = new Map<string, CustomCommand>();
  for (const cmd of globalCmds) seen.set(cmd.name, cmd);
  for (const cmd of projectCmds) seen.set(cmd.name, cmd);
  return [...seen.values()];
}
