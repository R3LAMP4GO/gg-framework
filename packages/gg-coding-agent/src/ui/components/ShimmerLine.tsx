import { useEffect, useRef } from "react";
import { useStdout } from "ink";

const SHIFT_INTERVAL = 80;
const LINE_CHAR = "━";

// Blue → violet → blue gradient for smooth looping
const GRADIENT = [
  [59, 130, 246], // #3b82f6
  [79, 125, 245], // #4f7df5
  [99, 120, 244], // #6378f4
  [119, 115, 243], // #7773f3
  [139, 110, 242], // #8b6ef2
  [159, 105, 241], // #9f69f1
  [167, 139, 250], // #a78bfa
  [159, 105, 241], // #9f69f1
  [139, 110, 242], // #8b6ef2
  [119, 115, 243], // #7773f3
  [99, 120, 244], // #6378f4
  [79, 125, 245], // #4f7df5
] as const;

function buildLine(width: number, shift: number): string {
  const len = GRADIENT.length;
  const parts: string[] = [];
  for (let i = 0; i < width; i++) {
    const idx = (((i - shift) % len) + len) % len;
    const [r, g, b] = GRADIENT[idx];
    parts.push(`\x1b[1;38;2;${r};${g};${b}m${LINE_CHAR}`);
  }
  parts.push("\x1b[0m");
  return parts.join("");
}

interface ShimmerLineProps {
  active: boolean;
}

export function ShimmerLine({ active }: ShimmerLineProps) {
  const { stdout } = useStdout();
  const shiftRef = useRef(0);

  useEffect(() => {
    if (!active || !stdout) return;

    const width = stdout.columns ?? 80;
    shiftRef.current = 0;

    const timer = setInterval(() => {
      const w = stdout.columns ?? 80;
      shiftRef.current = (shiftRef.current + 1) % GRADIENT.length;
      const line = buildLine(w, shiftRef.current);
      // Save cursor → move to row 1 col 1 → write line → restore cursor
      stdout.write(`\x1b7\x1b[1;1H${line}\x1b8`);
    }, SHIFT_INTERVAL);

    // Draw initial frame
    const line = buildLine(width, 0);
    stdout.write(`\x1b7\x1b[1;1H${line}\x1b8`);

    return () => {
      clearInterval(timer);
      // Clear the shimmer line
      stdout.write(`\x1b7\x1b[1;1H\x1b[2K\x1b8`);
    };
  }, [active, stdout]);

  // Returns null — rendering is done via raw ANSI escape codes
  return null;
}
