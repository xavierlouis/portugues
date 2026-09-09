import type { Box, CardState, Result } from "../types";

/** box:      1    2    3    4    5 */
export const INTERVALS: Record<Box, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };

export const MAX_BOX: Box = 5;

/** YYYY-MM-DD in the user's local timezone. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + days);
  return today(dt);
}

export function isDue(due: string, on: string = today()): boolean {
  return due <= on;
}

/** How many days overdue a card is. Negative means not yet due. */
export function daysOverdue(due: string, on: string = today()): number {
  const ms = new Date(`${on}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

export function newCard(on: string = today()): CardState {
  return { box: 1, due: on, seen: 0, lapses: 0 };
}

const clampBox = (n: number): Box => Math.min(5, Math.max(1, n)) as Box;

/**
 * §6 — correct promotes and schedules ahead; a near miss demotes one box and
 * stays due today; wrong resets to box 1 and stays due today.
 */
export function schedule(
  card: CardState,
  result: Result,
  on: string = today(),
): CardState {
  const seen = card.seen + 1;

  if (result === "correct") {
    const box = clampBox(card.box + 1);
    return { box, due: addDays(on, INTERVALS[box]), seen, lapses: card.lapses };
  }

  if (result === "accent" || result === "article") {
    return {
      box: clampBox(card.box - 1),
      due: on,
      seen,
      lapses: card.lapses + 1,
    };
  }

  return { box: 1, due: on, seen, lapses: card.lapses + 1 };
}
