/** Memory type taxonomy — matches Claude Code's 4-type system. */
export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Parse a raw frontmatter value into a MemoryType. Returns undefined for invalid/missing. */
export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== "string") return undefined;
  return MEMORY_TYPES.find((t) => t === raw);
}
