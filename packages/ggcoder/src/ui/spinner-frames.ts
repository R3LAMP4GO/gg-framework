// Sparkle character set — ping-pong cycle (forward then reverse)
// for a distinctive, playful feel. Ghostty gets a variant to avoid
// offset rendering of ✽.
function getSpinnerChars(): string[] {
  if (process.env.TERM === "xterm-ghostty") {
    return ["\u00B7", "\u2722", "\u2733", "\u2736", "\u273B", "*"];
  }
  return process.platform === "darwin"
    ? ["\u00B7", "\u2722", "\u2733", "\u2736", "\u273B", "\u273D"]
    : ["\u00B7", "\u2722", "*", "\u2736", "\u273B", "\u273D"];
}

const chars = getSpinnerChars();
export const SPINNER_FRAMES = [...chars, ...chars.reverse()];

export const SPINNER_INTERVAL = 120;

// Reduced-motion: static filled circle with slow dim/undim cycle
export const REDUCED_MOTION_DOT = "\u25CF"; // ●
