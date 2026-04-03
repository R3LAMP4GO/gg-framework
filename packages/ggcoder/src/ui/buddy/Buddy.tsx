import React, { useState, useEffect, useMemo, useRef } from "react";
import { Text, Box } from "ink";
import { getPlayerBuddy } from "./gacha.js";
import {
  renderSprite,
  renderBlink,
  renderFace,
  spriteFrameCount,
  RARITY_THEME_KEYS,
  RARITY_STARS,
} from "./species.js";
import type { ActivityPhase } from "../hooks/useAgentLoop.js";
import { useTheme, type Theme } from "../theme/theme.js";
import {
  useAnimationTick,
  useAnimationActive,
  deriveFrame,
  useReducedMotion,
} from "../components/AnimationContext.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

// ── Constants (matching Claude Code) ─────────────────────────

const TICK_MS = 500;
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
const MIN_COLS_FOR_FULL_SPRITE = 100;
const BUBBLE_SHOW = 20; // ticks (~10s)
const FADE_WINDOW = 6; // ticks (~3s fade before dismiss)
const PET_BURST_MS = 2500;

const PET_HEARTS = [
  "  \u2665   \u2665   ",
  " \u2665  \u2665  \u2665  ",
  "  \u2665 \u2665 \u2665   ",
  " \u2665  \u2665  \u2665  ",
  "  \u2665   \u2665   ",
];

// ── Speech Bubble ────────────────────────────────────────────

function SpeechBubble({ text, color, fading }: { text: string; color: string; fading: boolean }) {
  // Wrap to 30 chars max
  const maxWidth = 30;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  const width = Math.max(...lines.map((l) => l.length), 1);
  const top = "\u256D" + "\u2500".repeat(width + 2) + "\u256E";
  const bottom = "\u2570" + "\u2500".repeat(width + 2) + "\u256F";

  return (
    <Box flexDirection="column">
      <Text color={color} dimColor={fading}>
        {top}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} color={color} dimColor={fading}>
          {"\u2502 "}
          {line.padEnd(width)}
          {" \u2502"}
        </Text>
      ))}
      <Text color={color} dimColor={fading}>
        {bottom}
      </Text>
      <Text color={color} dimColor={fading}>
        {"  \\"}
      </Text>
    </Box>
  );
}

// ── Resolve rarity color from theme ──────────────────────────

function getRarityColor(rarity: string, theme: Theme): string {
  const key = RARITY_THEME_KEYS[rarity as keyof typeof RARITY_THEME_KEYS] ?? "textDim";
  return (theme as Record<string, string>)[key] ?? theme.textDim;
}

// ── Main Component ───────────────────────────────────────────

interface BuddyProps {
  phase?: ActivityPhase;
  /** Speech bubble text to display. */
  reaction?: string;
  /** Timestamp of last /buddy pet command. */
  petAt?: number;
  /** Callback to clear reaction after display. */
  onReactionDone?: () => void;
}

export function Buddy({ phase = "idle", reaction, petAt, onReactionDone }: BuddyProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { columns } = useTerminalSize();
  useAnimationActive();
  const tick = useAnimationTick();

  const buddy = useMemo(() => getPlayerBuddy(), []);
  const color = getRarityColor(buddy.rarity, theme);
  const shinyColor = "#fef08a";
  const displayColor = buddy.isShiny ? shinyColor : color;

  // ── Speech bubble state ──────────────────────────────────
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const bubbleTickRef = useRef(0);
  const lastReactionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (reaction && reaction !== lastReactionRef.current) {
      lastReactionRef.current = reaction;
      setBubbleText(reaction);
      bubbleTickRef.current = 0;
    }
  }, [reaction]);

  // Advance bubble timer
  useEffect(() => {
    if (!bubbleText) return;
    bubbleTickRef.current++;
    if (bubbleTickRef.current >= BUBBLE_SHOW) {
      setBubbleText(null);
      onReactionDone?.();
    }
  }, [tick, bubbleText, onReactionDone]);

  const bubbleFading = bubbleText ? bubbleTickRef.current >= BUBBLE_SHOW - FADE_WINDOW : false;

  // ── Pet hearts state ─────────────────────────────────────
  const showHearts = petAt ? Date.now() - petAt < PET_BURST_MS : false;
  const heartFrame = showHearts ? deriveFrame(tick, TICK_MS, PET_HEARTS.length) : -1;

  // ── Animation ────────────────────────────────────────────
  const seqIdx = deriveFrame(tick, TICK_MS, IDLE_SEQUENCE.length);
  const seqValue = IDLE_SEQUENCE[seqIdx];
  const frameCount = spriteFrameCount(buddy.species);

  const isActive = phase !== "idle";

  let spriteLines: string[];
  if (reducedMotion) {
    spriteLines = renderSprite(buddy, 0);
  } else if (showHearts || isActive) {
    // Cycle all frames fast when petting or active
    spriteLines = renderSprite(buddy, tick % frameCount);
  } else if (seqValue === -1) {
    spriteLines = renderBlink(buddy);
  } else {
    spriteLines = renderSprite(buddy, seqValue);
  }

  // ── Narrow mode ──────────────────────────────────────────
  if (columns < MIN_COLS_FOR_FULL_SPRITE) {
    const face = renderFace(buddy);
    const stars = RARITY_STARS[buddy.rarity];
    return (
      <Box>
        <Text color={displayColor}>
          {face} {buddy.species}
        </Text>
        <Text color={displayColor} dimColor>
          {" "}
          {stars}
          {buddy.isShiny ? " \u2726" : ""}
        </Text>
        {bubbleText && (
          <Text color={displayColor} dimColor={bubbleFading}>
            {' "'}
            {bubbleText.length > 24 ? bubbleText.slice(0, 21) + "..." : bubbleText}
            {'"'}
          </Text>
        )}
      </Box>
    );
  }

  // ── Wide mode: full sprite ───────────────────────────────
  return (
    <Box flexDirection="row" gap={1}>
      <Box flexDirection="column">
        {showHearts && heartFrame >= 0 && <Text color="#f87171">{PET_HEARTS[heartFrame]}</Text>}
        {spriteLines.map((line, i) => (
          <Text key={i} color={displayColor}>
            {line}
          </Text>
        ))}
        <Text color={displayColor} dimColor>
          {buddy.species}
          {buddy.isShiny ? " \u2726" : ""}
        </Text>
      </Box>
      {bubbleText && (
        <Box>
          <SpeechBubble text={bubbleText} color={displayColor} fading={bubbleFading} />
        </Box>
      )}
    </Box>
  );
}

/** How many columns the buddy sprite area reserves. */
export function companionReservedColumns(): number {
  return 14; // 12 char sprite + 2 gap
}
