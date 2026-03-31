import { hostname, userInfo, homedir } from "node:os";
import {
  ALL_SPECIES,
  SPECIES_RARITY,
  RARITY_WEIGHTS,
  RARITY_STAT_FLOORS,
  EYE_STYLES,
  type CompanionBones,
  type CompanionStats,
  type Rarity,
  type Hat,
} from "./species.js";

// ── FNV-1a hash ──────────────────────────────────────────────

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// ── Mulberry32 PRNG ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Seed ─────────────────────────────────────────────────────

function getUserSeed(): number {
  const identity = `${hostname()}:${userInfo().username}:${homedir()}:friend-2026-401`;
  return fnv1a(identity);
}

// ── Roll helpers ─────────────────────────────────────────────

function rollRarity(rand: number): Rarity {
  const roll = rand * 100;
  let cumulative = 0;
  for (const [rarity, weight] of RARITY_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return rarity;
  }
  return "common";
}

function rollStats(rng: () => number, rarity: Rarity): CompanionStats {
  const floor = RARITY_STAT_FLOORS[rarity];
  const keys: (keyof CompanionStats)[] = ["debugging", "patience", "chaos", "wisdom", "snark"];

  const peakIdx = Math.floor(rng() * keys.length);
  let dumpIdx = Math.floor(rng() * keys.length);
  while (dumpIdx === peakIdx) dumpIdx = Math.floor(rng() * keys.length);

  const stats: CompanionStats = { debugging: 0, patience: 0, chaos: 0, wisdom: 0, snark: 0 };
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i === peakIdx) {
      stats[key] = Math.min(100, 50 + Math.floor(rng() * 30) + floor);
    } else if (i === dumpIdx) {
      stats[key] = Math.max(1, -10 + Math.floor(rng() * 15) + floor);
    } else {
      stats[key] = floor + Math.floor(rng() * 40);
    }
  }
  return stats;
}

// ── Main roll (cached) ───────────────────────────────────────

const HATS: Hat[] = [
  "none",
  "crown",
  "tophat",
  "propeller",
  "halo",
  "wizard",
  "beanie",
  "tinyduck",
];

let rollCache: CompanionBones | null = null;

/**
 * Get the user's deterministic buddy companion.
 * Same machine always gets the same species, eyes, hat, stats.
 * Result is cached for hot paths (500ms sprite tick).
 */
export function getPlayerBuddy(): CompanionBones {
  if (rollCache) return rollCache;

  const seed = getUserSeed();
  const rng = mulberry32(seed);

  const rarity = rollRarity(rng());

  // Pick species from this rarity tier
  const candidates = ALL_SPECIES.filter((s) => SPECIES_RARITY[s] === rarity);
  const speciesIdx = Math.floor(rng() * candidates.length);
  const species = candidates[speciesIdx];

  const eyes = EYE_STYLES[Math.floor(rng() * EYE_STYLES.length)];
  const hat: Hat = rarity === "common" ? "none" : HATS[Math.floor(rng() * HATS.length)];
  const stats = rollStats(rng, rarity);
  const isShiny = rng() < 0.01;

  rollCache = { species, eyes, hat, stats, isShiny, rarity };
  return rollCache;
}
