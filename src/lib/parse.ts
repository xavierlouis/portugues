import { slugify } from "./normalize";

export type ParsedWord = { id: string; pt: string; tr: string[]; tags: string[] };
export type ParseResult = { words: ParsedWord[]; warnings: string[] };

/**
 * §4 — one `pt = fr` pair per line. `#` lines are tags, inherited by every word
 * below them. The first ` = ` splits; later ones belong to the translation.
 * Tolerant by design: this file is hand-edited on a phone.
 */
export function parseWordsTxt(text: string): ParseResult {
  const words: ParsedWord[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let tag: string | null = null;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trim();
    if (line === "") return;

    if (line.startsWith("#")) {
      const name = line.slice(1).trim();
      tag = name === "" ? null : name;
      return;
    }

    const sep = line.indexOf("=");
    if (sep < 0) {
      warnings.push(`line ${lineNo}: no "=" separator, skipped: ${line}`);
      return;
    }

    const pt = line.slice(0, sep).trim();
    const rest = line.slice(sep + 1).trim();

    if (pt === "") {
      warnings.push(`line ${lineNo}: empty Portuguese side, skipped`);
      return;
    }

    const tr = rest
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");

    if (tr.length === 0) {
      warnings.push(`line ${lineNo}: no translation for "${pt}", skipped`);
      return;
    }

    const id = slugify(pt);
    if (id === "") {
      warnings.push(`line ${lineNo}: "${pt}" has no usable id, skipped`);
      return;
    }

    const first = seen.get(id);
    if (first !== undefined) {
      warnings.push(`line ${lineNo}: duplicate "${pt}" (first seen on line ${first}), skipped`);
      return;
    }

    seen.set(id, lineNo);
    words.push({ id, pt, tr, tags: tag === null ? [] : [tag] });
  });

  return { words, warnings };
}
