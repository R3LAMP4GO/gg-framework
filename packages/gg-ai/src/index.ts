// Core entry point
export { stream } from "./stream.js";

// Types
export type {
  Provider,
  ThinkingLevel,
  CacheRetention,
  TextContent,
  ThinkingContent,
  ImageContent,
  ToolCall,
  ToolResult,
  ToolResultImage,
  ServerToolCall,
  ServerToolResult,
  ServerToolDefinition,
  RawContent,
  ContentPart,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
  Tool,
  ToolChoice,
  TextDeltaEvent,
  ThinkingDeltaEvent,
  ToolCallDeltaEvent,
  ToolCallDoneEvent,
  ServerToolCallEvent,
  ServerToolResultEvent,
  DoneEvent,
  ErrorEvent,
  StreamEvent,
  StopReason,
  StreamResponse,
  Usage,
  StreamOptions,
} from "./types.js";

// Classes
export { StreamResult, EventStream } from "./utils/event-stream.js";
export { GGAIError, ProviderError } from "./errors.js";
