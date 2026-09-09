import type { CardState, Direction, SessionCard, Word } from "../types";
import { cardKey } from "../types";
import { daysOverdue, today as todayFn } from "./scheduler";
import { hasCloze } from "./words";

export const NEW_CARD_CAP = 8;
export const CLOZE_UNLOCK_BOX = 3;
export const REQUEUE_GAP = 4;
export const MAX_REQUEUES = 2;

export type SessionOptions = {
  size: number;
  today?: string;
  tagFilter?: string[];
  /** Injectable for deterministic tests. */
  rng?: () => number;
};

type Candidate = {
  key: string;
  word: Word;
  direction: Direction;
  /** 0 = overdue, 1 = due today, 2 = never seen */
  tier: 0 | 1 | 2;
  overdue: number;
};

/** §6 — cloze unlocks once the word's fr>pt card reaches box 3. */
export function availableDirections(
  word: Word,
  cards: Record<string, CardState>,
): Direction[] {
  const dirs: Direction[] = ["fr>pt", "pt>fr"];
  const primary = cards[cardKey(word.id, "fr>pt")];
  if (primary && primary.box >= CLOZE_UNLOCK_BOX && hasCloze(word)) dirs.push("cloze");
  return dirs;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * §8 — overdue (most overdue first), then due, then new; shuffled inside each
 * tier, capped, then rearranged so no two cards of the same word touch.
 */
export function buildSession(
  cards: Record<string, CardState>,
  words: Word[],
  opts: SessionOptions,
): SessionCard[] {
  const on = opts.today ?? todayFn();
  const rng = opts.rng ?? Math.random;
  const tagFilter = opts.tagFilter ?? [];

  const pool =
    tagFilter.length === 0
      ? words
      : words.filter((w) => w.tags.some((t) => tagFilter.includes(t)));

  const candidates: Candidate[] = [];
  for (const word of pool) {
    for (const direction of availableDirections(word, cards)) {
      const key = cardKey(word.id, direction);
      const state = cards[key];
      if (!state) {
        candidates.push({ key, word, direction, tier: 2, overdue: 0 });
        continue;
      }
      const over = daysOverdue(state.due, on);
      if (over < 0) continue; // not due yet
      candidates.push({ key, word, direction, tier: over > 0 ? 0 : 1, overdue: over });
    }
  }

  // Shuffle inside each equal-priority group: the tier order (and, within the
  // overdue tier, how overdue a card is) is meaningful; the order inside a
  // group is not.
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const g = `${c.tier}:${String(1_000_000 - c.overdue).padStart(8, "0")}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(c);
  }
  const ordered = [...groups.keys()]
    .sort()
    .flatMap((g) => shuffle(groups.get(g)!, rng));

  const picked: Candidate[] = [];
  let newCount = 0;
  for (const c of ordered) {
    if (picked.length >= opts.size) break;
    if (c.tier === 2) {
      if (newCount >= NEW_CARD_CAP) continue;
      newCount++;
    }
    picked.push(c);
  }

  return spaceOutWords(
    picked.map((c) => ({
      key: c.key,
      word: c.word,
      direction: c.direction,
      requeues: 0,
    })),
  );
}

/** Rearranges in place so two cards of the same word are never adjacent. */
export function spaceOutWords(queue: SessionCard[]): SessionCard[] {
  const a = [...queue];
  for (let i = 1; i < a.length; i++) {
    if (a[i]!.word.id !== a[i - 1]!.word.id) continue;

    // Pull forward the nearest card that fits here and leaves its own slot valid.
    let swapped = false;
    for (let j = i + 1; j < a.length; j++) {
      const cand = a[j]!;
      if (cand.word.id === a[i - 1]!.word.id) continue;
      const before = a[j - 1]!;
      const after = a[j + 1];
      if (j - 1 !== i && before.word.id === a[i]!.word.id) continue;
      if (after && after.word.id === a[i]!.word.id) continue;
      [a[i], a[j]] = [a[j]!, a[i]!];
      swapped = true;
      break;
    }
    // Nothing fits (e.g. only one word left in the queue) — leave it rather
    // than loop forever.
    if (!swapped) continue;
  }
  return a;
}

/**
 * §8.5 — a wrong or near-miss card goes back into the queue at least
 * REQUEUE_GAP cards later, at most MAX_REQUEUES times, then it is dropped.
 */
export function requeue(rest: SessionCard[], card: SessionCard): SessionCard[] {
  if (card.requeues >= MAX_REQUEUES) return rest;

  const next = { ...card, requeues: card.requeues + 1 };
  let at = Math.min(REQUEUE_GAP, rest.length);
  // Don't land next to another card for the same word.
  while (
    at < rest.length &&
    (rest[at - 1]?.word.id === next.word.id || rest[at]?.word.id === next.word.id)
  ) {
    at++;
  }
  return [...rest.slice(0, at), next, ...rest.slice(at)];
}

export function dueCount(
  cards: Record<string, CardState>,
  words: Word[],
  on: string = todayFn(),
  tagFilter: string[] = [],
): number {
  return buildSession(cards, words, { size: Number.MAX_SAFE_INTEGER, today: on, tagFilter })
    .length;
}
