import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";
import { Spinner } from "./Spinner.js";

interface ServerToolRunningProps {
  status: "running";
  name: string;
  input: unknown;
  startedAt?: number;
}

interface ServerToolDoneProps {
  status: "done";
  name: string;
  input: unknown;
  resultType?: string;
  data?: unknown;
  durationMs?: number;
}

type ServerToolExecutionProps = ServerToolRunningProps | ServerToolDoneProps;

export function ServerToolExecution(props: ServerToolExecutionProps) {
  const theme = useTheme();
  const { label, detail } = getHeader(props.name, props.input);

  const header = (
    <Text>
      <Text color={theme.primary}>{"⏺ "}</Text>
      <Text bold color={theme.toolName}>
        {label}
      </Text>
      {detail && (
        <Text color={theme.text}>
          {"("}
          <Text color={theme.textDim}>{'"'}</Text>
          {detail}
          <Text color={theme.textDim}>{'"'}</Text>
          {")"}
        </Text>
      )}
    </Text>
  );

  if (props.status === "running") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>{header}</Box>
        <Box paddingLeft={2}>
          <Text color={theme.textDim}>{"⎿  "}</Text>
          <Spinner label="Searching..." />
        </Box>
      </Box>
    );
  }

  const duration = props.durationMs != null ? Math.round(props.durationMs / 1000) : 0;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>{header}</Box>
      <Box paddingLeft={2}>
        <Text color={theme.textDim}>
          {"⎿  "}Did 1 search in {duration}s
        </Text>
      </Box>
    </Box>
  );
}

function getHeader(name: string, input: unknown): { label: string; detail: string } {
  const inp = (input ?? {}) as Record<string, unknown>;
  if (name === "web_search") {
    const query = String(inp.query ?? "");
    const trunc = query.length > 60 ? query.slice(0, 57) + "…" : query;
    return { label: "Web Search", detail: trunc };
  }
  return { label: name, detail: "" };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface WebSearchResult {
  type: string;
  title?: string;
  url?: string;
}

function getSearchResults(resultType: string | undefined, data: unknown): WebSearchResult[] | null {
  if (resultType !== "web_search_tool_result") return null;

  const raw = data as Record<string, unknown>;
  const content = raw.content as WebSearchResult[] | undefined;
  if (!Array.isArray(content)) return null;

  return content.filter((item) => item.type === "web_search_result" && item.title);
}
