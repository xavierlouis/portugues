import { z } from "zod";
import type { HistoryEntry, Store } from "../types";
import { today } from "./scheduler";

export const KEY = "pt-trainer:v1";
const HISTORY_DAYS = 365;

const boxSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const cardSchema = z.object({
  box: boxSchema,
  due: dateSchema,
  seen: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
});

const settingsSchema = z.object({
  sessionSize: z.union([z.literal(10), z.literal(20), z.literal(40)]),
  speech: z.boolean(),
  tagFilter: z.array(z.string()),
});

export const storeSchema = z.object({
  v: z.literal(1),
  cards: z.record(z.string(), cardSchema),
  history: z.array(
    z.object({
      d: dateSchema,
      seen: z.number().int().nonnegative(),
      ok: z.number().int().nonnegative(),
    }),
  ),
  settings: settingsSchema,
});

export function emptyStore(): Store {
  return {
    v: 1,
    cards: {},
    history: [],
    settings: { sessionSize: 20, speech: true, tagFilter: [] },
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryFallback = (): StorageLike => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

let fallback: StorageLike | null = null;

function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.getItem(KEY); // throws in private mode / blocked contexts
      return localStorage;
    }
  } catch {
    /* fall through */
  }
  return (fallback ??= memoryFallback());
}

export type LoadResult = { store: Store; quarantined: string | null };

/**
 * §9 — never wipe. A blob that fails to parse or validate is renamed to
 * `pt-trainer:v1:corrupt-<timestamp>` and a fresh store is returned, so a bad
 * write can still be recovered by hand.
 */
export function load(
  storage: StorageLike = defaultStorage(),
  now: Date = new Date(),
): LoadResult {
  const raw = storage.getItem(KEY);
  if (raw === null) return { store: emptyStore(), quarantined: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { store: emptyStore(), quarantined: quarantine(storage, raw, now) };
  }

  const result = storeSchema.safeParse(parsed);
  if (!result.success) {
    return { store: emptyStore(), quarantined: quarantine(storage, raw, now) };
  }

  return { store: result.data, quarantined: null };
}

function quarantine(storage: StorageLike, raw: string, now: Date): string {
  const key = `${KEY}:corrupt-${now.toISOString().replace(/[:.]/g, "-")}`;
  storage.setItem(key, raw);
  storage.removeItem(KEY);
  return key;
}

export function save(store: Store, storage: StorageLike = defaultStorage()): void {
  try {
    storage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota or a blocked context: losing a write is better than crashing mid-session.
  }
}

/** Records one answer against today's history row, trimmed to the last year. */
export function recordAnswer(store: Store, ok: boolean, on: string = today()): Store {
  const history = [...store.history];
  const last = history[history.length - 1];
  if (last && last.d === on) {
    history[history.length - 1] = {
      d: on,
      seen: last.seen + 1,
      ok: last.ok + (ok ? 1 : 0),
    };
  } else {
    const i = history.findIndex((h) => h.d === on);
    if (i >= 0) {
      const e = history[i]!;
      history[i] = { d: on, seen: e.seen + 1, ok: e.ok + (ok ? 1 : 0) };
    } else {
      history.push({ d: on, seen: 1, ok: ok ? 1 : 0 });
    }
  }
  history.sort((a, b) => a.d.localeCompare(b.d));
  return { ...store, history: trimHistory(history, on) };
}

export function trimHistory(history: HistoryEntry[], on: string = today()): HistoryEntry[] {
  const cutoff = new Date(`${on}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  const min = today(cutoff);
  return history.filter((h) => h.d >= min);
}

/**
 * §9 — merge takes, per card key, the entry with the higher box; ties go to the
 * later due date. This is the laptop <-> phone reconciliation path.
 */
export function merge(base: Store, incoming: Store): Store {
  const cards = { ...base.cards };
  for (const [key, inc] of Object.entries(incoming.cards)) {
    const cur = cards[key];
    if (!cur) {
      cards[key] = inc;
      continue;
    }
    if (inc.box > cur.box || (inc.box === cur.box && inc.due > cur.due)) {
      cards[key] = { ...inc, seen: Math.max(cur.seen, inc.seen), lapses: Math.max(cur.lapses, inc.lapses) };
    } else {
      cards[key] = { ...cur, seen: Math.max(cur.seen, inc.seen), lapses: Math.max(cur.lapses, inc.lapses) };
    }
  }

  const byDay = new Map<string, HistoryEntry>();
  for (const h of [...base.history, ...incoming.history]) {
    const prev = byDay.get(h.d);
    // Same day on two devices: keep the busier record rather than summing,
    // which would double-count a session that was already synced once.
    if (!prev || h.seen > prev.seen) byDay.set(h.d, h);
  }
  const history = [...byDay.values()].sort((a, b) => a.d.localeCompare(b.d));

  return { v: 1, cards, history: trimHistory(history), settings: base.settings };
}

export function parseImport(text: string): Store {
  return storeSchema.parse(JSON.parse(text));
}

export function exportFilename(on: string = today()): string {
  return `pt-progress-${on}.json`;
}
