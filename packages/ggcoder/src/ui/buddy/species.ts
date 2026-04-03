/**
 * Buddy companion species definitions.
 *
 * Each species has ASCII art frames (5 lines tall, 12 chars wide),
 * eye placeholder {E} for expression variants, and a rarity tier.
 * Matches Claude Code's buddy system architecture.
 *
 * Line 0 is the hat slot — left blank so hats can overlay it.
 * {E} is replaced with the companion's eye character at render time.
 * Blink replaces {E} with "-" rather than using separate frames.
 */

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type EyeStyle = "\u00B7" | "\u2726" | "\u00D7" | "\u25C9" | "@" | "\u00B0";

export type Hat =
  | "none"
  | "crown"
  | "tophat"
  | "propeller"
  | "halo"
  | "wizard"
  | "beanie"
  | "tinyduck";

export type Species =
  | "duck"
  | "goose"
  | "blob"
  | "cat"
  | "dragon"
  | "octopus"
  | "owl"
  | "penguin"
  | "turtle"
  | "snail"
  | "ghost"
  | "axolotl"
  | "capybara"
  | "cactus"
  | "robot"
  | "rabbit"
  | "mushroom"
  | "chonk"
  | "phoenix";

/** Hat art for line 0 (replaces blank first line when hat present). */
export const HAT_LINES: Record<Hat, string> = {
  none: "",
  crown: "   \\^^^/    ",
  tophat: "    ___     ",
  propeller: "    ~+~     ",
  halo: "    ooo     ",
  wizard: "    /^\\     ",
  beanie: "    ---     ",
  tinyduck: "    ,>      ",
};

export interface CompanionStats {
  debugging: number;
  patience: number;
  chaos: number;
  wisdom: number;
  snark: number;
}

// ── Rarity config ────────────────────────────────────────────

export const RARITY_WEIGHTS: [Rarity, number][] = [
  ["common", 60],
  ["uncommon", 25],
  ["rare", 10],
  ["epic", 4],
  ["legendary", 1],
];

export const RARITY_STAT_FLOORS: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

export const RARITY_STARS: Record<Rarity, string> = {
  common: "\u2605",
  uncommon: "\u2605\u2605",
  rare: "\u2605\u2605\u2605",
  epic: "\u2605\u2605\u2605\u2605",
  legendary: "\u2605\u2605\u2605\u2605\u2605",
};

// Rarity colors mapped to theme keys (like CC), with fallback hex
export const RARITY_THEME_KEYS: Record<Rarity, string> = {
  common: "textDim",
  uncommon: "success",
  rare: "primary",
  epic: "accent",
  legendary: "warning",
};

// ── Bodies: Record<Species, string[][]> ──────────────────────
// 3 frames per species, 5 lines each, 12 chars wide.
// Frame 0: idle rest. Frame 1: fidget. Frame 2: alternate/effect.

export const BODIES: Record<Species, string[][]> = {
  duck: [
    ["            ", "    __      ", "  ({E} >    ", "  /||\\     ", "  ~~~~      "],
    ["            ", "    __      ", "  ({E} >    ", "  \\||/     ", "  ~~~~      "],
    ["            ", "    __      ", "  ({E} >    ", "  /||\\     ", "   ~~~~     "],
  ],
  goose: [
    ["            ", "    __      ", "  ({E} }    ", "  /||\\     ", "  d  b      "],
    ["            ", "    __      ", "  ({E} }    ", "  /|~|\\    ", "  d  b      "],
    ["            ", "   _/__     ", "  ({E} }    ", "  /||\\     ", "  d  b      "],
  ],
  blob: [
    ["            ", "  .-----.   ", " ( {E}  {E} )  ", "  ( __ )    ", "  '---'     "],
    ["            ", "  .-----.   ", " ( {E}  {E} )  ", "  ( __ )    ", "   '--'     "],
    ["            ", "  .-----.   ", " ( {E}  {E} )  ", "   (__)     ", "  '---'     "],
  ],
  cat: [
    ["            ", "  /\\_/\\    ", " ( {E}.{E} )  ", "  > ^ <     ", "   |||      "],
    ["            ", "  /\\_/\\    ", " ( {E}.{E} )  ", "   > ^<     ", "   |||      "],
    ["            ", "  /\\_/\\    ", " ( {E}.{E} )  ", "  > ^ <     ", "    ~||     "],
  ],
  snail: [
    ["            ", "    @/      ", "   {E} __   ", "  /_/       ", "  ~~~~      "],
    ["            ", "     @/     ", "    {E} __  ", "   /_/      ", "   ~~~~     "],
    ["            ", "    @/      ", "   {E} __   ", "  /_/       ", "   ~~~~     "],
  ],
  turtle: [
    ["            ", "    ____    ", "  ({E}  {E})   ", "  /|==|\\   ", "  d    b    "],
    ["            ", "    ____    ", "  ({E}  {E})   ", "  /|==|\\   ", "   d    b   "],
    ["            ", "    ____    ", "  ({E}  {E})   ", "  \\|==|/   ", "  d    b    "],
  ],
  owl: [
    ["            ", "   /{\\      ", "  ({E},{E})    ", "  /)  )     ", '  " "       '],
    ["            ", "   /{\\      ", "  ({E},{E})    ", "  (  (\\    ", '  " "       '],
    ["            ", "   /{\\      ", "  ({E},{E})    ", "  /)  )     ", '   " "      '],
  ],
  penguin: [
    ["            ", "    (^)     ", "   /{E}\\    ", "  / | \\    ", "  d   b     "],
    ["            ", "    (^)     ", "   \\{E}/    ", "   \\|/     ", "  d   b     "],
    ["            ", "    (^)     ", "   /{E}\\    ", "  / | \\    ", "   d   b    "],
  ],
  rabbit: [
    ["            ", "   (\\(\\    ", "  ({E} {E})    ", "  (> <)     ", '  (" ")     '],
    ["            ", "   (\\(\\    ", "  ({E} {E})    ", "  (>~<)     ", '  (" ")     '],
    ["            ", "   /)/)     ", "  ({E} {E})    ", "  (> <)     ", '  (" ")     '],
  ],
  ghost: [
    ["            ", "   .---.    ", "  ( {E} {E})   ", "  |   |     ", "  ~v~v~     "],
    ["            ", "   .---.    ", "  ({E} {E} )   ", "  |   |     ", "  ~v~v~     "],
    ["            ", "   .---.    ", "  ( {E} {E})   ", "  |   |     ", "   ~v~v~    "],
  ],
  mushroom: [
    ["            ", "   ,---.    ", "  / * * \\   ", "  |({E}{E})|   ", "   |__|     "],
    ["            ", "   ,---.    ", "  /* * *\\   ", "  |({E}{E})|   ", "   |__|     "],
    ["            ", "   .---.    ", "  / * * \\   ", "  |({E}{E})|   ", "   |__|     "],
  ],
  robot: [
    ["            ", "  [=====]   ", "  [{E} {E}]    ", "  /|=|\\    ", "   d b      "],
    ["            ", "  [=====]   ", "  [{E} {E}]    ", "  \\|=|/    ", "   d b      "],
    ["            ", "  [==o==]   ", "  [{E} {E}]    ", "  /|=|\\    ", "   d b      "],
  ],
  octopus: [
    ["            ", "   ,--,     ", "  ({E}  {E})   ", "  /||||\\   ", "  ~~~~~~    "],
    ["            ", "   ,--,     ", "  ({E}  {E})   ", "  \\||||/   ", "  ~~~~~~    "],
    ["            ", "   ,--,     ", "  ({E}  {E})   ", "  /||\\/    ", "  ~~~~~~    "],
  ],
  axolotl: [
    ["            ", "  ~\\/~\\/   ", "  ({E}  {E})   ", "   \\__/    ", "   ~~~~     "],
    ["            ", "  ~\\/~\\/   ", "  ({E}  {E})   ", "   \\__/    ", "    ~~~~    "],
    ["            ", "  /~\\/~\\   ", "  ({E}  {E})   ", "   \\__/    ", "   ~~~~     "],
  ],
  dragon: [
    ["            ", "  /\\_/\\_   ", " ( {E}  {E} )  ", "  ~\\/\\/~   ", "  ~/  \\~   "],
    ["            ", "  /\\_/\\_   ", " ( {E}  {E} )  ", "  ~\\/\\/~   ", "  ~/ ~\\~   "],
    ["            ", "  /\\_/\\_   ", " ( {E}  {E} )  ", "   ~/\\/~   ", "  ~/  \\~   "],
  ],
  capybara: [
    ["            ", "   .__.     ", "  ({E} {E})    ", "  (___/)    ", '  (" ")     '],
    ["            ", "   .__.     ", "  ({E} {E})    ", "  (___/)    ", '   (" ")    '],
    ["            ", "   .__.     ", "  ( {E}{E})    ", "  (___/)    ", '  (" ")     '],
  ],
  phoenix: [
    ["            ", "  ,/|\\,    ", " ({E}   {E})   ", "  '|^|'     ", "  ~\\/\\/ ~  "],
    ["            ", "  '/|\\`    ", " ({E}   {E})   ", "  ,|^|,     ", "  ~ \\/\\/~  "],
    ["            ", "  ,/|\\,    ", " ({E}   {E})   ", "  '|^|'     ", "  ~\\/\\/ ~  "],
  ],
  cactus: [
    ["            ", "    |       ", "  ({E} {E})    ", "  -| |-     ", "  ~~~~~     "],
    ["            ", "    |       ", "  ({E} {E})    ", "  -| |-     ", "   ~~~~~    "],
    ["            ", "    |       ", "  ( {E}{E})    ", "  -| |-     ", "  ~~~~~     "],
  ],
  chonk: [
    ["            ", "  .-----.   ", " ({E}    {E})  ", " (      )   ", "  '~~~~'    "],
    ["            ", "  .-----.   ", " ({E}    {E})  ", "  (    )    ", "  '~~~~'    "],
    ["            ", "  .------.  ", " ({E}    {E})  ", " (      )   ", "   '~~~~'   "],
  ],
};

/** All species names. */
export const ALL_SPECIES: Species[] = [
  "duck",
  "goose",
  "blob",
  "cat",
  "snail",
  "turtle",
  "owl",
  "penguin",
  "rabbit",
  "ghost",
  "mushroom",
  "robot",
  "octopus",
  "axolotl",
  "dragon",
  "capybara",
  "phoenix",
  "cactus",
  "chonk",
];

/** Species rarity mapping. */
export const SPECIES_RARITY: Record<Species, Rarity> = {
  duck: "common",
  goose: "common",
  blob: "common",
  cat: "common",
  snail: "common",
  turtle: "common",
  owl: "uncommon",
  penguin: "uncommon",
  rabbit: "uncommon",
  ghost: "uncommon",
  mushroom: "uncommon",
  robot: "rare",
  octopus: "rare",
  axolotl: "rare",
  dragon: "epic",
  capybara: "epic",
  phoenix: "legendary",
  cactus: "legendary",
  chonk: "legendary",
};

/** All available eye styles. */
export const EYE_STYLES: EyeStyle[] = ["\u00B7", "\u2726", "\u00D7", "\u25C9", "@", "\u00B0"];

// ── Sprite rendering ─────────────────────────────────────────

export interface CompanionBones {
  species: Species;
  eyes: EyeStyle;
  hat: Hat;
  stats: CompanionStats;
  isShiny: boolean;
  rarity: Rarity;
}

/** Render sprite lines with eyes and hat applied. */
export function renderSprite(bones: CompanionBones, frame: number): string[] {
  const frames = BODIES[bones.species];
  const lines = [...(frames[frame] ?? frames[0])];

  // Replace eye placeholders
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i].replaceAll("{E}", bones.eyes);
  }

  // Apply hat on line 0 if present
  if (bones.hat !== "none" && lines[0].trim() === "") {
    const hatLine = HAT_LINES[bones.hat];
    if (hatLine) lines[0] = hatLine;
  }

  return lines;
}

/** Render blink frame (eyes replaced with -). */
export function renderBlink(bones: CompanionBones): string[] {
  const lines = [...BODIES[bones.species][0]];
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i].replaceAll("{E}", "-");
  }
  if (bones.hat !== "none" && lines[0].trim() === "") {
    const hatLine = HAT_LINES[bones.hat];
    if (hatLine) lines[0] = hatLine;
  }
  return lines;
}

/** Compact one-line face for narrow terminals. */
export function renderFace(bones: CompanionBones): string {
  const e = bones.eyes;
  switch (bones.species) {
    case "cat":
      return `=${e}.${e}=`;
    case "duck":
    case "goose":
      return `(${e}>`;
    case "blob":
    case "chonk":
      return `(${e} ${e})`;
    case "owl":
      return `{${e},${e}}`;
    case "robot":
      return `[${e}_${e}]`;
    case "ghost":
      return `(${e} ${e})~`;
    case "dragon":
    case "phoenix":
      return `<${e} ${e}>`;
    default:
      return `(${e}${e})`;
  }
}

/** Number of animation frames for a species (always 3). */
export function spriteFrameCount(_species: Species): number {
  return 3;
}
