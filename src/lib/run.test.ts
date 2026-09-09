import { describe, expect, it } from "vitest";
import wordsJson from "../data/words.json";
import { answer } from "./run";
import { buildSession } from "./session";
import { emptyStore, load, save, type StorageLike } from "./storage";
import { match } from "./normalize";
import { expectedAnswers, isNoun, wordsFileSchema } from "./words";
import type { SessionCard, Store } from "../types";

const words = wordsFileSchema.parse(wordsJson);
const on = "2026-09-04";
const seeded = (seed: number) => {
  let n = seed;
  return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
};

/** Types the given text into the current card, exactly as the UI would. */
function play(store: Store, queue: SessionCard[], typed: string, at = on) {
  const card = queue[0]!;
  const result = match(typed, expectedAnswers(card.word, card.direction), {
    allowArticleMiss: card.direction === "fr>pt" && isNoun(card.word),
  });
  return { result, ...answer(store, queue, result, at) };
}

const correctAnswerFor = (c: SessionCard) => expectedAnswers(c.word, c.direction)[0]!;

describe("a full session", () => {
  it("ends when every card has been answered correctly once", () => {
    let store = emptyStore();
    let queue = buildSession(store.cards, words, { size: 20, today: on, rng: seeded(7) });
    expect(queue.length).toBeGreaterThan(0);

    let guard = 0;
    while (queue.length > 0 && guard++ < 200) {
      ({ store, queue } = play(store, queue, correctAnswerFor(queue[0]!)));
    }

    expect(queue).toHaveLength(0);
    expect(store.history).toEqual([{ d: on, seen: 8, ok: 8 }]);
    expect(Object.values(store.cards).every((c) => c.box === 2)).toBe(true);
  });

  it("brings a wrong card back and does not end until it is right", () => {
    let store = emptyStore();
    let queue = buildSession(store.cards, words, { size: 20, today: on, rng: seeded(3) });
    const first = queue[0]!;

    ({ store, queue } = play(store, queue, "zzzzz"));
    expect(store.cards[first.key]!.box).toBe(1);
    expect(queue.some((c) => c.key === first.key)).toBe(true);

    let guard = 0;
    while (queue.length > 0 && guard++ < 200) {
      ({ store, queue } = play(store, queue, correctAnswerFor(queue[0]!)));
    }
    expect(store.cards[first.key]!.box).toBe(2);
  });

  it("drops a card that keeps being wrong after two requeues", () => {
    let store = emptyStore();
    let queue = buildSession(store.cards, words, { size: 20, today: on, rng: seeded(11) });
    const stubborn = queue[0]!.key;

    let seenCount = 0;
    let guard = 0;
    while (queue.length > 0 && guard++ < 400) {
      const isStubborn = queue[0]!.key === stubborn;
      if (isStubborn) seenCount++;
      ({ store, queue } = play(store, queue, isStubborn ? "zzzzz" : correctAnswerFor(queue[0]!)));
    }

    expect(seenCount).toBe(3); // first answer + two requeues, then dropped
    expect(store.cards[stubborn]!.box).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it("scores an accent miss as a near miss and requeues it", () => {
    const reuniao = words.find((w) => w.id === "reuniao")!;
    const queue = buildSession({}, [reuniao], { size: 20, today: on, rng: seeded(1) }).filter(
      (c) => c.direction === "fr>pt",
    );

    const step = play(emptyStore(), queue, "a reuniao");
    expect(step.result).toBe("accent");
    expect(step.store.cards[queue[0]!.key]).toMatchObject({ box: 1, due: on });
    expect(step.queue.map((c) => c.key)).toContain(queue[0]!.key);
  });

  it("scores a missing article AND a missing accent as wrong", () => {
    // §7.2 checks exact, then article, then accents. Two mistakes at once is
    // not a near miss.
    const reuniao = words.find((w) => w.id === "reuniao")!;
    const queue = buildSession({}, [reuniao], { size: 20, today: on, rng: seeded(1) }).filter(
      (c) => c.direction === "fr>pt",
    );
    expect(play(emptyStore(), queue, "reuniao").result).toBe("wrong");
    expect(play(emptyStore(), queue, "reunião").result).toBe("article");
  });

  it("scores a bare noun as an article miss", () => {
    const cadeira = words.find((w) => w.id === "cadeira")!;
    const queue = buildSession({}, [cadeira], { size: 20, today: on, rng: seeded(1) }).filter(
      (c) => c.direction === "fr>pt",
    );
    expect(play(emptyStore(), queue, "cadeira").result).toBe("article");
    expect(play(emptyStore(), queue, "a cadeira").result).toBe("correct");
  });
});

describe("persistence across a reload", () => {
  it("loses nothing when the tab closes mid-session", () => {
    const mem = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };

    let store = emptyStore();
    let queue = buildSession(store.cards, words, { size: 20, today: on, rng: seeded(5) });

    for (let i = 0; i < 3; i++) {
      ({ store, queue } = play(store, queue, correctAnswerFor(queue[0]!)));
      save(store, storage); // §8 — after every answer, not at session end
    }

    const reloaded = load(storage).store;
    expect(reloaded).toEqual(store);
    expect(Object.keys(reloaded.cards)).toHaveLength(3);
    expect(reloaded.history[0]).toEqual({ d: on, seen: 3, ok: 3 });
  });

  it("keeps progress for a word removed from words.json", () => {
    let store = emptyStore();
    let queue = buildSession(store.cards, words, { size: 20, today: on, rng: seeded(9) });
    ({ store, queue } = play(store, queue, correctAnswerFor(queue[0]!)));

    const shrunk = words.filter((w) => w.id !== queue[0]?.word.id);
    const next = buildSession(store.cards, shrunk, { size: 20, today: on, rng: seeded(9) });

    // The orphaned key is ignored when scheduling but still present in storage.
    expect(next.every((c) => shrunk.some((w) => w.id === c.word.id))).toBe(true);
    expect(Object.keys(store.cards).length).toBeGreaterThan(0);
  });
});

describe("a card's life over several days", () => {
  it("climbs the boxes on the spec's intervals", () => {
    const w = words.find((w) => w.id === "rua")!;
    let store = emptyStore();
    const key = "rua|fr>pt";

    // Each interval runs from the day the card is actually reviewed.
    const days = ["2026-09-04", "2026-09-05", "2026-09-08", "2026-09-15", "2026-10-06"];
    const expected = [
      ["2026-09-05", 2], // +1
      ["2026-09-08", 3], // +3
      ["2026-09-15", 4], // +7
      ["2026-10-06", 5], // +21
      ["2026-10-27", 5], // stays at 5, fresh 21 days
    ] as const;

    for (let i = 0; i < days.length; i++) {
      const queue = buildSession(store.cards, [w], {
        size: 20,
        today: days[i]!,
        rng: seeded(2),
      }).filter((c) => c.key === key);
      expect(queue, `day ${days[i]}`).toHaveLength(1);

      ({ store } = play(store, queue, correctAnswerFor(queue[0]!), days[i]!));
      expect(store.cards[key]).toMatchObject({ due: expected[i]![0], box: expected[i]![1] });
    }
  });
});
