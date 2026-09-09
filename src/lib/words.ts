import { z } from "zod";
import { POS_VALUES, type Direction, type Word } from "../types";
import { stripDiacritics } from "./normalize";

export const wordSchema = z.object({
  id: z.string().min(1),
  pt: z.string().min(1),
  tr: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string()),
  pos: z.enum(POS_VALUES),
  article: z.union([
    z.literal("o"),
    z.literal("a"),
    z.literal("os"),
    z.literal("as"),
    z.null(),
  ]),
  trGender: z.union([z.literal("m"), z.literal("f"), z.null()]).catch(null),
  example: z.object({ pt: z.string().min(1), tr: z.string().min(1) }),
  enrichedAt: z.string().min(1),
});

/** What the enrichment model is asked to return, per word. */
export const enrichedSchema = z.object({
  pt: z.string().min(1),
  pos: z.enum(POS_VALUES),
  article: z
    .union([z.literal("o"), z.literal("a"), z.literal("os"), z.literal("as"), z.null()])
    .catch(null),
  trGender: z.union([z.literal("m"), z.literal("f"), z.null()]).catch(null),
  example: z.object({ pt: z.string().min(1), tr: z.string().min(1) }),
});

export const wordsFileSchema = z.array(wordSchema);

export const isNoun = (w: Word): boolean => w.pos === "noun" && w.article !== null;

/** §6 — for nouns the fr>pt answer includes the article: "a cadeira". */
export function expectedAnswers(word: Word, direction: Direction): string[] {
  switch (direction) {
    case "fr>pt":
      return [isNoun(word) ? `${word.article} ${word.pt}` : word.pt];
    case "pt>fr":
      return word.tr;
    case "cloze": {
      const c = cloze(word);
      return c ? [c.answer] : [word.pt];
    }
  }
}

export type Cloze = { text: string; answer: string };

const TOKEN = /[\p{L}\p{M}'’-]+/gu;
const fold = (s: string) => stripDiacritics(s.toLowerCase());

/**
 * Blanks the target word out of its example sentence. The sentence uses the
 * word inflected ("arrumo" for "arrumar"), so an exact phrase match is tried
 * first and a prefix match second.
 */
export function cloze(word: Word): Cloze | null {
  const sentence = word.example.pt;
  const target = fold(word.pt);

  // Multi-word entries ("apesar de") only ever match as a phrase.
  const phrase = new RegExp(
    `(?<![\\p{L}\\p{M}])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{M}])`,
    "iu",
  );
  const folded = fold(sentence);
  // Diacritic folding is 1:1 for the Latin alphabet, but only trust the indices
  // if the length really did survive.
  const m = folded.length === sentence.length ? phrase.exec(folded) : null;
  if (m) {
    return {
      text: `${sentence.slice(0, m.index)}____${sentence.slice(m.index + m[0].length)}`,
      answer: sentence.slice(m.index, m.index + m[0].length),
    };
  }

  if (word.pt.includes(" ")) return null;

  let best: { start: number; end: number; score: number } | null = null;
  for (const tok of sentence.matchAll(TOKEN)) {
    const raw = tok[0];
    const f = fold(raw);
    let p = 0;
    while (p < f.length && p < target.length && f[p] === target[p]) p++;
    const need = Math.max(3, Math.ceil(Math.min(f.length, target.length) * 0.6));
    if (p < need) continue;
    if (!best || p > best.score) {
      best = { start: tok.index, end: tok.index + raw.length, score: p };
    }
  }
  if (!best) return null;

  return {
    text: `${sentence.slice(0, best.start)}____${sentence.slice(best.end)}`,
    answer: sentence.slice(best.start, best.end),
  };
}

export const hasCloze = (word: Word): boolean => cloze(word) !== null;

/**
 * §6/§10 — the fr>pt noun prompt shows the *French* gender ("chaise (f.)"), so
 * the point of the card is producing the Portuguese one, which often disagrees.
 * Comes from enrichment, or from an article the user wrote in words.txt.
 */
export function frenchGender(word: Word): "m." | "f." | null {
  if (!isNoun(word)) return null;
  if (word.trGender === "f") return "f.";
  if (word.trGender === "m") return "m.";
  const t = word.tr[0]!;
  if (/^(la|une)\s/i.test(t)) return "f.";
  if (/^(le|un)\s/i.test(t)) return "m.";
  return null;
}

export function allTags(words: Word[]): string[] {
  const set = new Set<string>();
  for (const w of words) for (const t of w.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, "pt"));
}
