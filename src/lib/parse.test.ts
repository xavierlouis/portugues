import { describe, expect, it } from "vitest";
import { parseWordsTxt } from "./parse";

describe("parseWordsTxt", () => {
  it("parses pairs and inherits the most recent tag", () => {
    const { words } = parseWordsTxt(`# Casa
cadeira = chaise
arrumar = ranger

# Trabalho
prazo = délai`);

    expect(words).toEqual([
      { id: "cadeira", pt: "cadeira", tr: ["chaise"], tags: ["Casa"] },
      { id: "arrumar", pt: "arrumar", tr: ["ranger"], tags: ["Casa"] },
      { id: "prazo", pt: "prazo", tr: ["délai"], tags: ["Trabalho"] },
    ]);
  });

  it("leaves words above the first tag untagged", () => {
    expect(parseWordsTxt("rua = rue").words[0]!.tags).toEqual([]);
  });

  it("splits on the first = and keeps later ones in the translation", () => {
    const { words } = parseWordsTxt("igual a = égal à = pareil");
    expect(words[0]!.pt).toBe("igual a");
    expect(words[0]!.tr).toEqual(["égal à = pareil"]);
  });

  it("splits multiple translations on commas, first is canonical", () => {
    expect(parseWordsTxt("prazo = délai, échéance").words[0]!.tr).toEqual([
      "délai",
      "échéance",
    ]);
  });

  it("tolerates missing spaces around the separator and stray whitespace", () => {
    const { words } = parseWordsTxt("   cadeira=chaise   ");
    expect(words[0]).toMatchObject({ pt: "cadeira", tr: ["chaise"] });
  });

  it("ignores blank lines", () => {
    expect(parseWordsTxt("\n\n  \nrua = rue\n\n").words).toHaveLength(1);
  });

  it("keeps the first of a duplicate and warns", () => {
    const { words, warnings } = parseWordsTxt("rua = rue\nrua = route");
    expect(words).toHaveLength(1);
    expect(words[0]!.tr).toEqual(["rue"]);
    expect(warnings[0]).toMatch(/duplicate "rua".*line 1/);
  });

  it("warns on a line with no separator", () => {
    const { words, warnings } = parseWordsTxt("cadeira chaise");
    expect(words).toHaveLength(0);
    expect(warnings[0]).toMatch(/no "=" separator/);
  });

  it("warns on an empty side", () => {
    expect(parseWordsTxt("= chaise").warnings[0]).toMatch(/empty Portuguese side/);
    expect(parseWordsTxt("cadeira =").warnings[0]).toMatch(/no translation/);
  });

  it("derives the id from pt with diacritics stripped", () => {
    const { words } = parseWordsTxt("reunião = réunion\napesar de = malgré");
    expect(words.map((w) => w.id)).toEqual(["reuniao", "apesar-de"]);
  });

  it("treats a bare # as clearing the tag", () => {
    const { words } = parseWordsTxt("# Casa\ncadeira = chaise\n#\nrua = rue");
    expect(words[1]!.tags).toEqual([]);
  });
});
