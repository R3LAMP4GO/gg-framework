export { MEMORY_TYPES, parseMemoryType, type MemoryType } from "./types.js";
export {
  getAutoMemPath,
  getAutoMemEntrypoint,
  isAutoMemPath,
  ensureMemoryDirExists,
  clearMemPathCache,
} from "./paths.js";
export { scanMemoryFiles, formatMemoryManifest, type MemoryHeader } from "./scan.js";
export { memoryAgeDays, memoryAge, memoryFreshnessText } from "./age.js";
export { buildMemoryPromptSection } from "./prompt.js";
export {
  runExtraction,
  buildExtractionPrompt,
  hasMemoryWritesSince,
  countMessagesSince,
  isReadOnlyBashCommand,
  type ExtractState,
} from "./extract.js";
export {
  checkConsolidationGate,
  tryAcquireLock,
  rollbackLock,
  readLastConsolidatedAt,
  countSessionsSince,
  buildConsolidationPrompt,
  type ConsolidationGateResult,
} from "./consolidate.js";
