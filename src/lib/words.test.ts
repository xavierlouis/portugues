import { describe, expect, it } from "vitest";
import wordsJson from "../data/words.json";
import { allTags, cloze, expectedAnswers, frenchGender, isNoun, wordsFileSchema } from "./words";
import type { Word } from "../types";

const words = wordsFileSchema.parse(wordsJson);
const byId = (id: string): Word => {
  const w = words.find((x) => x.id === id);
  if (!w) throw new Error(`no word ${id}`);
  return w;
};

describe("words.json", () => {
  it("validates against the schema", () => {
    expect(words.length).toBeGreaterThan(0);
  });

  it("has unique ids, sorted by pt", () => {
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
    expect([...words].sort((a, b) => a.pt.localeCompare(b.pt, "pt")).map((w) => w.id)).toEqual(
      words.map((w) => w.id),
    );
  });

  it("gives every noun an article and nothing else one", () => {
    for (const w of words) {
      if (w.pos === "noun") expect(w.article, w.pt).not.toBeNull();
      else expect(w.article, w.pt).toBeNull();
    }
  });

  it("keeps every example to 8 words or fewer", () => {
    for (const w of words) {
      expect(w.example.pt.trim().split(/\s+/).length, w.example.pt).toBeLessThanOrEqual(8);
    }
  });

  it("can build a cloze for every word", () => {
    for (const w of words) expect(cloze(w), w.pt).not.toBeNull();
  });
});

describe("expectedAnswers", () => {
  it("includes the article for a noun on fr>pt", () => {
    expect(expectedAnswers(byId("cadeira"), "fr>pt")).toEqual(["a cadeira"]);
    expect(expectedAnswers(byId("comboio"), "fr>pt")).toEqual(["o comboio"]);
  });

  it("omits the article for a non-noun", () => {
    expect(expectedAnswers(byId("arrumar"), "fr>pt")).toEqual(["arrumar"]);
  });

  it("accepts every translation on pt>fr", () => {
    expect(expectedAnswers(byId("prazo"), "pt>fr")).toEqual(["délai", "échéance"]);
  });

  it("expects the inflected form on cloze", () => {
    expect(expectedAnswers(byId("cadeira"), "cloze")).toEqual(["cadeira"]);
  });
});

describe("cloze", () => {
  const w = (over: Partial<Word>): Word => ({
    id: "x",
    pt: "arrumar",
    tr: ["ranger"],
    tags: [],
    pos: "verb",
    article: null,
    trGender: null,
    example: { pt: "Tenho de arrumar o quarto.", tr: "Je dois ranger la chambre." },
    enrichedAt: "2026-09-04",
    ...over,
  });

  it("blanks an exact occurrence", () => {
    expect(cloze(w({}))).toEqual({ text: "Tenho de ____ o quarto.", answer: "arrumar" });
  });

  it("blanks an inflected form and expects it as typed", () => {
    const c = cloze(w({ example: { pt: "Arrumo o quarto todos os dias.", tr: "Je range." } }));
    expect(c).toEqual({ text: "____ o quarto todos os dias.", answer: "Arrumo" });
  });

  it("matches across diacritics", () => {
    const c = cloze(
      w({ pt: "reunião", pos: "noun", article: "a", example: { pt: "A reunião foi adiada.", tr: "x" } }),
    );
    expect(c).toEqual({ text: "A ____ foi adiada.", answer: "reunião" });
  });

  it("does not blank a merely similar word", () => {
    expect(cloze(w({ pt: "casa", example: { pt: "O carro é azul.", tr: "x" } }))).toBeNull();
  });

  it("matches a multi-word entry as a phrase only", () => {
    const c = cloze(
      w({ pt: "apesar de", pos: "prep", example: { pt: "Saímos apesar de chover.", tr: "x" } }),
    );
    expect(c).toEqual({ text: "Saímos ____ chover.", answer: "apesar de" });
    expect(cloze(w({ pt: "apesar de", example: { pt: "Saímos apesar da chuva.", tr: "x" } }))).toBeNull();
  });

  it("does not match a word inside a longer word", () => {
    expect(cloze(w({ pt: "rua", example: { pt: "O cruas não existe.", tr: "x" } }))).toBeNull();
  });
});

describe("frenchGender", () => {
  it("shows the French gender, which may disagree with the Portuguese", () => {
    expect(frenchGender(byId("viagem"))).toBe("m."); // le voyage -> a viagem
    expect(byId("viagem").article).toBe("a");
    expect(frenchGender(byId("cadeira"))).toBe("f.");
  });

  it("is null for non-nouns", () => {
    expect(frenchGender(byId("arrumar"))).toBeNull();
  });
});

describe("isNoun / allTags", () => {
  it("recognises nouns with an article", () => {
    expect(isNoun(byId("rua"))).toBe(true);
    expect(isNoun(byId("arrumar"))).toBe(false);
  });

  it("lists tags sorted and deduplicated", () => {
    const tags = allTags(words);
    expect(tags).toEqual([...new Set(tags)]);
    expect(tags).toEqual([...tags].sort((a, b) => a.localeCompare(b, "pt")));
    expect(new Set(tags)).toEqual(new Set(words.flatMap((w) => w.tags)));
    expect(tags).toContain("Casa");
  });
});
