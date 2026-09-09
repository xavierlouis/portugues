import { describe, expect, it } from "vitest";
import {
  MAX_REQUEUES,
  NEW_CARD_CAP,
  availableDirections,
  buildSession,
  dueCount,
  requeue,
  spaceOutWords,
} from "./session";
import type { CardState, SessionCard, Word } from "../types";
import { cardKey } from "../types";

const on = "2026-09-04";

const word = (id: string, over: Partial<Word> = {}): Word => ({
  id,
  pt: id,
  tr: [`fr-${id}`],
  tags: ["Casa"],
  pos: "noun",
  article: "a",
  trGender: "f",
  example: { pt: `A ${id} está aqui.`, tr: "x" },
  enrichedAt: on,
  ...over,
});

const state = (box: CardState["box"], due: string): CardState => ({
  box,
  due,
  seen: 1,
  lapses: 0,
});

/** Deterministic rng so tier order is the only thing under test. */
const fixedRng = () => 0.5;

describe("availableDirections", () => {
  const w = word("cadeira");

  it("offers fr>pt and pt>fr from the start", () => {
    expect(availableDirections(w, {})).toEqual(["fr>pt", "pt>fr"]);
  });

  it("keeps cloze locked below box 3", () => {
    expect(availableDirections(w, { [cardKey("cadeira", "fr>pt")]: state(2, on) })).toEqual([
      "fr>pt",
      "pt>fr",
    ]);
  });

  it("unlocks cloze at box 3", () => {
    expect(availableDirections(w, { [cardKey("cadeira", "fr>pt")]: state(3, on) })).toEqual([
      "fr>pt",
      "pt>fr",
      "cloze",
    ]);
  });

  it("never unlocks cloze for a word with no usable example", () => {
    const noCloze = word("xyz", { example: { pt: "Nada aqui.", tr: "x" } });
    expect(availableDirections(noCloze, { [cardKey("xyz", "fr>pt")]: state(5, on) })).toEqual([
      "fr>pt",
      "pt>fr",
    ]);
  });
});

describe("buildSession", () => {
  const words = Array.from({ length: 30 }, (_, i) => word(`w${i}`));

  it("respects the session cap", () => {
    const cards: Record<string, CardState> = {};
    for (const w of words) {
      cards[cardKey(w.id, "fr>pt")] = state(1, on);
      cards[cardKey(w.id, "pt>fr")] = state(1, on);
    }
    expect(buildSession(cards, words, { size: 20, today: on, rng: fixedRng })).toHaveLength(20);
    expect(buildSession(cards, words, { size: 10, today: on, rng: fixedRng })).toHaveLength(10);
  });

  it("caps new cards at 8 even when the session is bigger", () => {
    const out = buildSession({}, words, { size: 40, today: on, rng: fixedRng });
    expect(out).toHaveLength(NEW_CARD_CAP);
  });

  it("does not let new cards bury reviews", () => {
    const cards: Record<string, CardState> = {};
    for (const w of words.slice(0, 15)) cards[cardKey(w.id, "fr>pt")] = state(2, on);

    const out = buildSession(cards, words, { size: 20, today: on, rng: fixedRng });
    const seenKeys = new Set(Object.keys(cards));
    const reviews = out.filter((c) => seenKeys.has(c.key)).length;

    expect(out).toHaveLength(20);
    expect(reviews).toBe(15);
    expect(out.length - reviews).toBe(5);
  });

  it("puts the most overdue cards first, then due, then new", () => {
    const cards = {
      [cardKey("w0", "fr>pt")]: state(2, "2026-09-04"), // due today
      [cardKey("w1", "fr>pt")]: state(2, "2026-08-25"), // 10 days overdue
      [cardKey("w2", "fr>pt")]: state(2, "2026-09-01"), // 3 days overdue
    };
    const three = [word("w0"), word("w1"), word("w2")];
    const out = buildSession(cards, three, { size: 3, today: on, rng: fixedRng });
    expect(out.map((c) => c.key)).toEqual([
      cardKey("w1", "fr>pt"),
      cardKey("w2", "fr>pt"),
      cardKey("w0", "fr>pt"),
    ]);
  });

  it("excludes cards that are not due yet", () => {
    const cards = {
      [cardKey("w0", "fr>pt")]: state(2, "2026-09-20"), // scheduled ahead, cloze still locked
      [cardKey("w0", "pt>fr")]: state(2, "2026-09-20"),
    };
    expect(buildSession(cards, [word("w0")], { size: 20, today: on, rng: fixedRng })).toEqual([]);
  });

  it("still offers the cards that are due when a sibling is not", () => {
    const cards = { [cardKey("w0", "fr>pt")]: state(2, "2026-09-20") };
    const out = buildSession(cards, [word("w0")], { size: 20, today: on, rng: fixedRng });
    expect(out.map((c) => c.key)).toEqual([cardKey("w0", "pt>fr")]);
  });

  it("never puts two cards of the same word next to each other", () => {
    for (let seed = 0; seed < 50; seed++) {
      let n = seed;
      const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
      const out = buildSession({}, words, { size: 20, today: on, rng });
      for (let i = 1; i < out.length; i++) {
        expect(out[i]!.word.id, `seed ${seed}`).not.toBe(out[i - 1]!.word.id);
      }
    }
  });

  it("filters by tag", () => {
    const tagged = [
      word("a", { tags: ["Casa"] }),
      word("b", { tags: ["Trabalho"] }),
      word("c", { tags: [] }),
    ];
    const out = buildSession({}, tagged, {
      size: 20,
      today: on,
      tagFilter: ["Trabalho"],
      rng: fixedRng,
    });
    expect(new Set(out.map((c) => c.word.id))).toEqual(new Set(["b"]));
  });

  it("starts every card at zero requeues", () => {
    expect(
      buildSession({}, words, { size: 5, today: on, rng: fixedRng }).every(
        (c) => c.requeues === 0,
      ),
    ).toBe(true);
  });
});

describe("spaceOutWords", () => {
  const c = (id: string, dir: "fr>pt" | "pt>fr"): SessionCard => ({
    key: cardKey(id, dir),
    word: word(id),
    direction: dir,
    requeues: 0,
  });

  it("separates a same-word pair", () => {
    const out = spaceOutWords([c("a", "fr>pt"), c("a", "pt>fr"), c("b", "fr>pt")]);
    expect(out[0]!.word.id).not.toBe(out[1]!.word.id);
    expect(out[1]!.word.id).not.toBe(out[2]!.word.id);
  });

  it("keeps every card", () => {
    const input = [c("a", "fr>pt"), c("a", "pt>fr"), c("b", "fr>pt"), c("b", "pt>fr")];
    const out = spaceOutWords(input);
    expect(new Set(out.map((x) => x.key))).toEqual(new Set(input.map((x) => x.key)));
  });

  it("gives up gracefully when separation is impossible", () => {
    const input = [c("a", "fr>pt"), c("a", "pt>fr")];
    expect(spaceOutWords(input)).toHaveLength(2);
  });
});

describe("requeue", () => {
  const c = (id: string, requeues = 0): SessionCard => ({
    key: cardKey(id, "fr>pt"),
    word: word(id),
    direction: "fr>pt",
    requeues,
  });
  const rest = ["r0", "r1", "r2", "r3", "r4", "r5"].map((id) => c(id));

  it("reinserts at least 4 cards later", () => {
    const out = requeue(rest, c("x"));
    expect(out.indexOf(out.find((k) => k.word.id === "x")!)).toBeGreaterThanOrEqual(4);
    expect(out).toHaveLength(7);
  });

  it("appends when the queue is shorter than the gap", () => {
    const short = rest.slice(0, 2);
    const out = requeue(short, c("x"));
    expect(out.map((k) => k.word.id)).toEqual(["r0", "r1", "x"]);
  });

  it("appends to an empty queue", () => {
    expect(requeue([], c("x")).map((k) => k.word.id)).toEqual(["x"]);
  });

  it("increments the requeue counter", () => {
    expect(requeue(rest, c("x"))[4]!.requeues).toBe(1);
    expect(requeue(rest, c("x", 1))[4]!.requeues).toBe(2);
  });

  it("drops a card after the maximum number of requeues", () => {
    expect(requeue(rest, c("x", MAX_REQUEUES))).toEqual(rest);
    expect(requeue(rest, c("x", MAX_REQUEUES + 1))).toEqual(rest);
  });

  it("does not land beside another card for the same word", () => {
    const q = [c("r0"), c("r1"), c("r2"), c("x"), c("r4"), c("r5")];
    const out = requeue(q, c("x"));
    const at = out.findIndex((k, i) => k.word.id === "x" && out[i - 1]?.word.id !== "x" || false);
    for (let i = 1; i < out.length; i++) {
      if (out[i]!.word.id === "x") expect(out[i - 1]!.word.id).not.toBe("x");
    }
    expect(at).toBeGreaterThan(-1);
  });
});

describe("dueCount", () => {
  it("counts what the next session would actually contain", () => {
    const words = Array.from({ length: 5 }, (_, i) => word(`w${i}`));
    expect(dueCount({}, words, on)).toBe(NEW_CARD_CAP);

    // fr>pt scheduled ahead at box 3 unlocks cloze, so pt>fr + cloze are new:
    // 10 new cards, clipped to the new-card cap.
    const cards: Record<string, CardState> = {};
    for (const w of words) cards[cardKey(w.id, "fr>pt")] = state(3, "2026-09-20");
    expect(dueCount(cards, words, on)).toBe(NEW_CARD_CAP);

    // At box 2 the cloze stays locked, leaving only the five pt>fr cards.
    const locked: Record<string, CardState> = {};
    for (const w of words) locked[cardKey(w.id, "fr>pt")] = state(2, "2026-09-20");
    expect(dueCount(locked, words, on)).toBe(5);
  });
});
