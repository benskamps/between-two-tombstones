// Tombstone Bingo: seeded 5×5 cards, line detection, and party room codes.

import { seededRandom, shuffled } from "./rng";
import { FREE_SQUARE, SYMBOLS, type GraveSymbol } from "./symbols";

export const SIZE = 5;
export const CENTER = 12;

/** 25 symbol ids, row by row; index 12 is always the free "R.I.P." square. */
export function makeCard(seed: string, pool: readonly GraveSymbol[] = SYMBOLS): string[] {
  if (pool.length < SIZE * SIZE - 1) throw new Error("Not enough symbols for a card");
  const picks = shuffled(
    pool.map((s) => s.id),
    seededRandom(seed),
  ).slice(0, SIZE * SIZE - 1);
  return [...picks.slice(0, CENTER), FREE_SQUARE.id, ...picks.slice(CENTER)];
}

export type Line = { kind: "row" | "column" | "diagonal"; index: number; cells: number[] };

export const LINES: Line[] = [
  ...Array.from({ length: SIZE }, (_, r) => ({
    kind: "row" as const,
    index: r,
    cells: Array.from({ length: SIZE }, (_, c) => r * SIZE + c),
  })),
  ...Array.from({ length: SIZE }, (_, c) => ({
    kind: "column" as const,
    index: c,
    cells: Array.from({ length: SIZE }, (_, r) => r * SIZE + c),
  })),
  { kind: "diagonal", index: 0, cells: Array.from({ length: SIZE }, (_, i) => i * SIZE + i) },
  { kind: "diagonal", index: 1, cells: Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)) },
];

/** Lines whose five squares are all marked. The centre counts as marked. */
export function completedLines(marked: ReadonlySet<number>): Line[] {
  return LINES.filter((l) => l.cells.every((i) => i === CENTER || marked.has(i)));
}

export function lineName(l: Line): string {
  if (l.kind === "row") return `row ${l.index + 1}`;
  if (l.kind === "column") return `column ${l.index + 1}`;
  return l.index === 0 ? "the diagonal from top left" : "the diagonal from top right";
}

export function bingoMessage(lines: Line[]): string | null {
  if (!lines.length) return null;
  const names = lines.map(lineName);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Bingo! You completed ${list}.`;
}

// Party room codes: six letters, no I, L or O so they can't be misread.
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_LENGTH = 6;

/** A random room code. `random` returns [0, 1); pass a crypto-backed one in the browser. */
export function makeRoomCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < ROOM_LENGTH; i++) {
    code += ROOM_ALPHABET[Math.min(ROOM_ALPHABET.length - 1, Math.floor(random() * ROOM_ALPHABET.length))];
  }
  return code;
}

/** "kxm-prt" → "KXMPRT"; null if it isn't a valid room code. */
export function normalizeRoomCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== ROOM_LENGTH) return null;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return null;
  return code;
}

export function partySeed(code: string): string {
  return `party:${code}`;
}

export function partyPath(code: string): string {
  return `/games/bingo?party=${code}`;
}

/** crypto.getRandomValues as a [0, 1) source, for room codes and solo seeds. */
export function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}
