import { describe, expect, it } from "vitest";
import {
  diff,
  match,
  normalize,
  slugify,
  stripDiacritics,
} from "./normalize";

describe("normalize", () => {
  it("trims and collapses whitespace", () => {
    expect(normalize("  a   cadeira  ")).toBe("a cadeira");
    expect(normalize("a\tcadeira")).toBe("a cadeira");
  });

  it("lowercases", () => {
    expect(normalize("A Cadeira")).toBe("a cadeira");
    expect(normalize("REUNIÃO")).toBe("reunião");
  });

  it("strips leading and trailing punctuation only", () => {
    expect(normalize("cadeira.")).toBe("cadeira");
    expect(normalize('"cadeira!"')).toBe("cadeira");
    expect(normalize("¿cadeira, alta?")).toBe("¿cadeira, alta");
  });

  it("returns NFC for dead-key decomposed input", () => {
    const composed = "coração";
    const decomposed = "coração".normalize("NFD");
    expect(decomposed).not.toBe(composed); // sanity: the inputs really differ
    expect(normalize(decomposed)).toBe(normalize(composed));
    expect(normalize(decomposed)).toBe(composed);
  });

  it("treats cedilla typed two ways as equal", () => {
    const a = "ç"; // ç precomposed
    const b = "ç"; // c + combining cedilla
    expect(normalize(a)).toBe(normalize(b));
  });
});

describe("stripDiacritics", () => {
  it("maps the Portuguese set", () => {
    expect(stripDiacritics("ç")).toBe("c");
    expect(stripDiacritics("ã")).toBe("a");
    expect(stripDiacritics("ê")).toBe("e");
    expect(stripDiacritics("ó")).toBe("o");
    expect(stripDiacritics("ü")).toBe("u");
    expect(stripDiacritics("õ")).toBe("o");
  });

  it("handles whole words", () => {
    expect(stripDiacritics("coração")).toBe("coracao");
    expect(stripDiacritics("reunião")).toBe("reuniao");
    expect(stripDiacritics("avô")).toBe("avo");
  });

  it("works on decomposed input too", () => {
    expect(stripDiacritics("coração".normalize("NFD"))).toBe("coracao");
  });
});

describe("slugify", () => {
  it("is derived from pt alone and is stable", () => {
    expect(slugify("cadeira")).toBe("cadeira");
    expect(slugify("reunião")).toBe("reuniao");
    expect(slugify("apesar de")).toBe("apesar-de");
    expect(slugify("  Apesar  De ")).toBe("apesar-de");
  });
});

describe("match", () => {
  it("accepts an exact answer", () => {
    expect(match("cadeira", ["cadeira"])).toBe("correct");
    expect(match(" Cadeira. ", ["cadeira"])).toBe("correct");
  });

  it("accepts alternate translations", () => {
    expect(match("échéance", ["délai", "échéance"])).toBe("correct");
    expect(match("délai", ["délai", "échéance"])).toBe("correct");
    expect(match("date", ["délai", "échéance"])).toBe("wrong");
  });

  it("calls coracao vs coração an accent miss", () => {
    expect(match("coracao", ["coração"])).toBe("accent");
  });

  it("calls cadeira vs a cadeira an article miss", () => {
    expect(match("cadeira", ["a cadeira"], { allowArticleMiss: true })).toBe(
      "article",
    );
  });

  it("calls the wrong gender an article miss", () => {
    expect(match("o cadeira", ["a cadeira"], { allowArticleMiss: true })).toBe(
      "article",
    );
  });

  it("does not report an article miss when the flag is off", () => {
    expect(match("cadeira", ["a cadeira"])).toBe("wrong");
  });

  it("checks exact before stripped", () => {
    // "ate" is a real word; it must not be shadowed by "até"
    expect(match("até", ["até", "ate"])).toBe("correct");
    expect(match("ate", ["até"])).toBe("accent");
  });

  it("prefers article over accent when both apply to the same target", () => {
    expect(match("reunião", ["a reunião"], { allowArticleMiss: true })).toBe(
      "article",
    );
  });

  it("rejects an empty answer", () => {
    expect(match("", ["cadeira"])).toBe("wrong");
    expect(match("   ", ["cadeira"])).toBe("wrong");
  });

  it("calls an unrelated answer wrong", () => {
    expect(match("mesa", ["cadeira"])).toBe("wrong");
  });
});

describe("diff", () => {
  const render = (parts: ReturnType<typeof diff>) =>
    parts.map((p) => `${p.char}:${p.state[0]}`).join(" ");

  it("marks an identical string all ok", () => {
    expect(diff("casa", "casa").every((p) => p.state === "ok")).toBe(true);
  });

  it("reassembles the input from ok+bad parts", () => {
    const parts = diff("coracao", "coração");
    const typed = parts
      .filter((p) => p.state !== "missing")
      .map((p) => p.char)
      .join("");
    expect(typed).toBe("coracao");
  });

  it("marks only the accented positions bad", () => {
    // A substitution carries the *typed* character (struck through); the
    // correct target is rendered on its own line, per §7.4.
    const parts = diff("coracao", "coração");
    expect(render(parts)).toBe("c:o o:o r:o a:o c:b a:b o:o");
  });

  it("marks a substituted character bad", () => {
    expect(render(diff("casa", "cara"))).toBe("c:o a:o s:b a:o");
  });

  it("marks an omitted character missing", () => {
    expect(render(diff("cadeir", "cadeira"))).toBe(
      "c:o a:o d:o e:o i:o r:o a:m",
    );
  });

  it("marks an extra character bad", () => {
    const parts = diff("cadeiraa", "cadeira");
    expect(parts.filter((p) => p.state === "bad")).toHaveLength(1);
    expect(parts.filter((p) => p.state === "missing")).toHaveLength(0);
    expect(parts.map((p) => p.char).join("")).toBe("cadeiraa");
  });

  it("handles an empty input", () => {
    expect(diff("", "casa").every((p) => p.state === "missing")).toBe(true);
    expect(diff("", "casa")).toHaveLength(4);
  });
});
