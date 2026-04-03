import { diffWordsWithSpace } from "diff";

export interface WordSegment {
  text: string;
  type: "added" | "removed" | "unchanged";
}

/**
 * Compute word-level diff between two strings.
 * Uses diffWordsWithSpace (not diffWords) so that whitespace/indentation
 * changes are visible — critical for code where indentation is meaningful.
 */
export function computeWordDiff(oldLine: string, newLine: string): WordSegment[] {
  const changes = diffWordsWithSpace(oldLine, newLine);
  const segments: WordSegment[] = [];

  for (const change of changes) {
    if (change.added) {
      segments.push({ text: change.value, type: "added" });
    } else if (change.removed) {
      segments.push({ text: change.value, type: "removed" });
    } else {
      segments.push({ text: change.value, type: "unchanged" });
    }
  }

  return segments;
}
