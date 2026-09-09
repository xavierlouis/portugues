import { beforeEach, describe, expect, it } from "vitest";
import {
  KEY,
  emptyStore,
  exportFilename,
  load,
  merge,
  parseImport,
  recordAnswer,
  save,
  trimHistory,
  type StorageLike,
} from "./storage";
import type { Store } from "../types";

function fakeStorage(): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

let s: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  s = fakeStorage();
});

describe("load", () => {
  it("returns an empty store when nothing is saved", () => {
    expect(load(s)).toEqual({ store: emptyStore(), quarantined: null });
  });

  it("round-trips a saved store", () => {
    const store = emptyStore();
    store.cards["cadeira|fr>pt"] = { box: 3, due: "2026-09-04", seen: 5, lapses: 1 };
    save(store, s);
    expect(load(s).store).toEqual(store);
  });

  it("quarantines unparseable JSON instead of wiping it", () => {
    s.setItem(KEY, "{not json");
    const { store, quarantined } = load(s);

    expect(store).toEqual(emptyStore());
    expect(quarantined).toMatch(/^pt-trainer:v1:corrupt-/);
    expect(s.getItem(quarantined!)).toBe("{not json");
    expect(s.getItem(KEY)).toBeNull();
  });

  it("quarantines a blob that fails validation instead of wiping it", () => {
    const bad = JSON.stringify({ v: 1, cards: { "a|fr>pt": { box: 9 } }, history: [], settings: {} });
    s.setItem(KEY, bad);
    const { store, quarantined } = load(s);

    expect(store).toEqual(emptyStore());
    expect(quarantined).not.toBeNull();
    expect(s.getItem(quarantined!)).toBe(bad);
  });

  it("does not overwrite an earlier quarantine", () => {
    s.setItem(KEY, "bad one");
    const first = load(s, new Date("2026-09-04T10:00:00Z")).quarantined!;
    s.setItem(KEY, "bad two");
    const second = load(s, new Date("2026-09-04T11:00:00Z")).quarantined!;

    expect(first).not.toBe(second);
    expect(s.getItem(first)).toBe("bad one");
    expect(s.getItem(second)).toBe("bad two");
  });
});

describe("recordAnswer", () => {
  it("creates today's row and accumulates into it", () => {
    let store = emptyStore();
    store = recordAnswer(store, true, "2026-09-04");
    store = recordAnswer(store, false, "2026-09-04");
    store = recordAnswer(store, true, "2026-09-04");
    expect(store.history).toEqual([{ d: "2026-09-04", seen: 3, ok: 2 }]);
  });

  it("starts a new row on a new day and keeps them sorted", () => {
    let store = emptyStore();
    store = recordAnswer(store, true, "2026-09-04");
    store = recordAnswer(store, true, "2026-09-05");
    expect(store.history.map((h) => h.d)).toEqual(["2026-09-04", "2026-09-05"]);
  });
});

describe("trimHistory", () => {
  it("keeps the last 365 days and drops older rows", () => {
    const history = [
      { d: "2024-01-01", seen: 1, ok: 1 },
      { d: "2026-08-01", seen: 1, ok: 1 },
      { d: "2026-09-04", seen: 1, ok: 1 },
    ];
    expect(trimHistory(history, "2026-09-04").map((h) => h.d)).toEqual([
      "2026-08-01",
      "2026-09-04",
    ]);
  });
});

describe("merge", () => {
  const withCards = (cards: Store["cards"]): Store => ({ ...emptyStore(), cards });

  it("picks the higher box", () => {
    const a = withCards({ "k|fr>pt": { box: 2, due: "2026-09-10", seen: 4, lapses: 0 } });
    const b = withCards({ "k|fr>pt": { box: 4, due: "2026-09-05", seen: 2, lapses: 1 } });
    expect(merge(a, b).cards["k|fr>pt"]).toMatchObject({ box: 4, due: "2026-09-05" });
  });

  it("breaks a box tie with the later due date", () => {
    const a = withCards({ "k|fr>pt": { box: 3, due: "2026-09-05", seen: 1, lapses: 0 } });
    const b = withCards({ "k|fr>pt": { box: 3, due: "2026-09-09", seen: 1, lapses: 0 } });
    expect(merge(a, b).cards["k|fr>pt"]!.due).toBe("2026-09-09");
    expect(merge(b, a).cards["k|fr>pt"]!.due).toBe("2026-09-09");
  });

  it("keeps cards that exist on only one side", () => {
    const a = withCards({ "a|fr>pt": { box: 1, due: "2026-09-04", seen: 0, lapses: 0 } });
    const b = withCards({ "b|pt>fr": { box: 1, due: "2026-09-04", seen: 0, lapses: 0 } });
    expect(Object.keys(merge(a, b).cards).sort()).toEqual(["a|fr>pt", "b|pt>fr"]);
  });

  it("keeps the higher seen and lapse counts either way round", () => {
    const a = withCards({ "k|fr>pt": { box: 5, due: "2026-09-20", seen: 9, lapses: 3 } });
    const b = withCards({ "k|fr>pt": { box: 2, due: "2026-09-05", seen: 12, lapses: 1 } });
    expect(merge(a, b).cards["k|fr>pt"]).toEqual({
      box: 5,
      due: "2026-09-20",
      seen: 12,
      lapses: 3,
    });
  });

  it("does not double-count a day that was already synced", () => {
    const day = { d: "2026-09-04", seen: 20, ok: 18 };
    const a = { ...emptyStore(), history: [day] };
    const b = { ...emptyStore(), history: [day] };
    expect(merge(a, b).history).toEqual([day]);
  });

  it("keeps the local settings", () => {
    const a = { ...emptyStore(), settings: { sessionSize: 40 as const, speech: false, tagFilter: ["Casa"] } };
    expect(merge(a, emptyStore()).settings).toEqual(a.settings);
  });
});

describe("parseImport", () => {
  it("accepts a valid export", () => {
    expect(parseImport(JSON.stringify(emptyStore()))).toEqual(emptyStore());
  });

  it("rejects anything else", () => {
    expect(() => parseImport("{}")).toThrow();
    expect(() => parseImport("nope")).toThrow();
  });
});

describe("exportFilename", () => {
  it("is dated", () => {
    expect(exportFilename("2026-09-04")).toBe("pt-progress-2026-09-04.json");
  });
});
