import { createHash } from "node:crypto";
import type { Token } from "marked";

const MAX_SIZE = 500;

/** Simple LRU cache for parsed markdown tokens. */
class MarkdownLRUCache {
  private cache = new Map<string, Token[]>();

  get(body: string): Token[] | undefined {
    const key = this.hash(body);
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(body: string, tokens: Token[]): void {
    const key = this.hash(body);
    // Delete first to reset insertion order
    this.cache.delete(key);
    this.cache.set(key, tokens);
    // Evict oldest if over capacity
    if (this.cache.size > MAX_SIZE) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }
  }

  private hash(body: string): string {
    return createHash("sha256").update(body).digest("hex");
  }
}

export const markdownTokenCache = new MarkdownLRUCache();

/**
 * Check whether text contains markdown syntax worth parsing.
 * If it doesn't, the caller can skip marked.lexer() entirely.
 * Matches Claude Code's MD_SYNTAX_RE patterns.
 */
const MARKDOWN_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /m;

export function containsMarkdownSyntax(text: string): boolean {
  // Only check the first 500 chars for performance
  const sample = text.length > 500 ? text.slice(0, 500) : text;
  return MARKDOWN_SYNTAX_RE.test(sample);
}
