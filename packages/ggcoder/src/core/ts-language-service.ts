import ts from "typescript";
import path from "node:path";

export interface TSDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code: number;
}

export interface TSHoverInfo {
  type: string;
  documentation: string;
}

export interface TSDefinitionInfo {
  file: string;
  line: number;
  column: number;
}

export class TSLanguageService {
  private service: ts.LanguageService | null = null;
  private fileVersions = new Map<string, number>();
  private options: ts.CompilerOptions = {};
  private rootFiles: string[] = [];
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /** Lazy init — only starts if tsconfig.json exists. */
  private ensureService(): ts.LanguageService | null {
    if (this.service) return this.service;

    const configPath = ts.findConfigFile(this.cwd, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) return null;

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) return null;

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );
    this.options = parsed.options;
    this.rootFiles = parsed.fileNames;

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => this.rootFiles,
      getScriptVersion: (fileName) => (this.fileVersions.get(fileName) ?? 0).toString(),
      getScriptSnapshot: (fileName) => {
        if (!ts.sys.fileExists(fileName)) return undefined;
        return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName) ?? "");
      },
      getCurrentDirectory: () => this.cwd,
      getCompilationSettings: () => this.options,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    return this.service;
  }

  /** Notify that a file was modified — bumps version for incremental recheck. */
  notifyFileChanged(filePath: string): void {
    const resolved = path.resolve(filePath);
    const version = (this.fileVersions.get(resolved) ?? 0) + 1;
    this.fileVersions.set(resolved, version);
    // Add to root files if not already tracked
    if (!this.rootFiles.includes(resolved)) {
      this.rootFiles.push(resolved);
    }
  }

  /** Get semantic diagnostics for a single file. */
  getDiagnostics(filePath: string): TSDiagnostic[] {
    const service = this.ensureService();
    if (!service) return [];
    const resolved = path.resolve(filePath);

    const diagnostics = [
      ...service.getSyntacticDiagnostics(resolved),
      ...service.getSemanticDiagnostics(resolved),
    ];

    return diagnostics.map((d) => {
      const pos = d.file?.getLineAndCharacterOfPosition(d.start ?? 0);
      return {
        file: path.relative(this.cwd, d.file?.fileName ?? resolved),
        line: (pos?.line ?? 0) + 1,
        column: (pos?.character ?? 0) + 1,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        code: d.code,
      };
    });
  }

  /** Get type info at a position (hover). */
  getHoverInfo(filePath: string, line: number, column: number): TSHoverInfo | null {
    const service = this.ensureService();
    if (!service) return null;
    const resolved = path.resolve(filePath);

    // Convert line:col to offset
    const snapshot = service.getProgram()?.getSourceFile(resolved);
    if (!snapshot) return null;
    const offset = snapshot.getPositionOfLineAndCharacter(line - 1, column - 1);

    const info = service.getQuickInfoAtPosition(resolved, offset);
    if (!info) return null;

    return {
      type: ts.displayPartsToString(info.displayParts),
      documentation: ts.displayPartsToString(info.documentation ?? []),
    };
  }

  /** Get definition location. */
  getDefinition(filePath: string, line: number, column: number): TSDefinitionInfo[] {
    const service = this.ensureService();
    if (!service) return [];
    const resolved = path.resolve(filePath);

    const snapshot = service.getProgram()?.getSourceFile(resolved);
    if (!snapshot) return [];
    const offset = snapshot.getPositionOfLineAndCharacter(line - 1, column - 1);

    const defs = service.getDefinitionAtPosition(resolved, offset);
    if (!defs) return [];

    return defs.map((d) => {
      const sf = service.getProgram()?.getSourceFile(d.fileName);
      const pos = sf?.getLineAndCharacterOfPosition(d.textSpan.start);
      return {
        file: path.relative(this.cwd, d.fileName),
        line: (pos?.line ?? 0) + 1,
        column: (pos?.character ?? 0) + 1,
      };
    });
  }

  /** Format diagnostics for tool result output. */
  formatDiagnostics(diagnostics: TSDiagnostic[], maxItems = 10): string {
    if (diagnostics.length === 0) return "";
    const shown = diagnostics.slice(0, maxItems);
    const lines = shown.map((d) => `TS${d.code}: ${d.file}:${d.line}:${d.column} — ${d.message}`);
    if (diagnostics.length > maxItems) {
      lines.push(`... and ${diagnostics.length - maxItems} more`);
    }
    return lines.join("\n");
  }

  dispose(): void {
    this.service?.dispose();
    this.service = null;
  }
}
