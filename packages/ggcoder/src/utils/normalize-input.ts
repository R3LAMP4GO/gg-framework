/**
 * Text input normalization pipeline — CC parity.
 *
 * Cleans pasted terminal output, whisper transcription, and raw user input
 * before sending to the LLM. Prevents formatting corruption, wasted tokens
 * on invisible characters, and odd agent responses.
 */

/**
 * Strip ANSI escape sequences (colors, bold, underline, cursor movement).
 * Equivalent to the `strip-ansi` npm package but without the dependency.
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * Remove control characters except newline (\n).
 * Strips NULL, BEL, ESC, and other C0/C1 controls.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x09\x0b-\x1f\x7f]/g;

function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHAR_RE, "");
}

/**
 * Full normalization pipeline for user input text.
 *
 * Steps (matching CC's onTextPaste handler):
 * 1. Strip ANSI escape codes
 * 2. Normalize line endings (CRLF/CR → LF)
 * 3. Expand tabs to 4 spaces
 * 4. Remove control characters (except newline)
 * 5. Unicode NFC normalization
 */
export function normalizeUserInput(text: string): string {
  let result = text;
  result = stripAnsi(result);
  result = result.replace(/\r\n?/g, "\n");
  result = result.replaceAll("\t", "    ");
  result = stripControlChars(result);
  result = result.normalize("NFC");
  return result;
}

// ── Large paste reference system ────────────────────────

/** Pastes larger than this create a reference pill instead of inline. */
export const PASTE_THRESHOLD = 800;

/** Input exceeding this is truncated with head+tail preview. */
export const TRUNCATION_THRESHOLD = 10_000;

/** How many chars to keep from each end when truncating. */
const PREVIEW_HEAD = 500;
const PREVIEW_TAIL = 500;

/**
 * Check if text should be converted to a paste reference.
 * Returns true if the text exceeds the paste threshold or has too many lines.
 */
export function shouldCreatePasteReference(text: string, maxLines = 2): boolean {
  if (text.length > PASTE_THRESHOLD) return true;
  const lineCount = text.split("\n").length;
  return lineCount > maxLines;
}

/**
 * Create a truncated reference string for large input.
 * Preserves first 500 and last 500 chars, replaces middle with placeholder.
 */
export function truncateForDisplay(text: string, pasteId: number): {
  display: string;
  full: string;
  lineCount: number;
} {
  const lineCount = text.split("\n").length;

  if (text.length <= TRUNCATION_THRESHOLD) {
    return {
      display: formatPasteRef(pasteId, lineCount, text.length),
      full: text,
      lineCount,
    };
  }

  const head = text.slice(0, PREVIEW_HEAD);
  const tail = text.slice(-PREVIEW_TAIL);
  const omittedLines = text.slice(PREVIEW_HEAD, -PREVIEW_TAIL).split("\n").length;
  const display = `${head}\n[...Truncated text #${pasteId} +${omittedLines} lines...]\n${tail}`;

  return { display, full: text, lineCount };
}

/** Format a paste reference badge. */
export function formatPasteRef(pasteId: number, lineCount: number, charCount: number): string {
  return `[Pasted text #${pasteId} +${lineCount} lines, ${charCount} chars]`;
}

/**
 * Parse paste reference IDs from text.
 * Matches `[Pasted text #N ...]` and `[...Truncated text #N ...]` patterns.
 */
export function parsePasteReferences(text: string): number[] {
  const ids: number[] = [];
  for (const match of text.matchAll(/\[(?:Pasted|\.\.\.Truncated) text #(\d+)/g)) {
    ids.push(parseInt(match[1], 10));
  }
  return ids;
}

/**
 * Parse image reference IDs from text.
 * Matches `[Image #N]` patterns.
 */
export function parseImageReferences(text: string): number[] {
  const ids: number[] = [];
  for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
    ids.push(parseInt(match[1], 10));
  }
  return ids;
}
