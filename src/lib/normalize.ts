import type { Result } from "../types";

const EDGE_PUNCT = /^[.,;:!?"'\s]+|[.,;:!?"'\s]+$/g;

/**
 * Trim -> collapse internal whitespace -> lowercase -> strip edge punctuation
 * -> NFC.
 *
 * NFC (not NFD) is deliberate: macOS dead-key input arrives decomposed, so
 * `ç` typed two different ways must compare equal.
 */
export function normalize(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(EDGE_PUNCT, "")
    .normalize("NFC");
}

/** NFD -> drop combining diacritics -> NFC. Maps ç->c, ã->a, ê->e, ó->o, ü->u. */
export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC");
}

/** slug of pt: lowercase, diacritics stripped, spaces -> "-" */
export function slugify(pt: string): string {
  return stripDiacritics(pt.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ARTICLE_PREFIX = /^(os|as|o|a)\s+/;

/** "a cadeira" -> "cadeira". Returns the input unchanged if it has no article. */
export function stripArticle(s: string): string {
  return s.replace(ARTICLE_PREFIX, "");
}

export function hasArticle(s: string): boolean {
  return ARTICLE_PREFIX.test(s);
}

export type MatchOptions = {
  /**
   * Enable the article-miss category. Set for `fr>pt` cards on nouns, where the
   * expected answer carries its definite article.
   */
  allowArticleMiss?: boolean;
};

/**
 * §7.2 — order matters: exact before stripped, always.
 *
 * 1. exact match against any accepted answer      -> correct
 * 2. article-stripped forms match (nouns only)    -> article
 * 3. diacritic-stripped forms match               -> accent
 * 4. otherwise                                    -> wrong
 */
export function match(
  input: string,
  accepted: string[],
  opts: MatchOptions = {},
): Result {
  const got = normalize(input);
  if (got === "") return "wrong";

  const targets = accepted.map(normalize);

  if (targets.includes(got)) return "correct";

  if (opts.allowArticleMiss) {
    const bare = stripArticle(got);
    // Catches both the bare noun ("cadeira") and the wrong gender ("o cadeira"),
    // which is exactly the mistake this card type exists to drill.
    if (targets.some((t) => hasArticle(t) && stripArticle(t) === bare))
      return "article";
  }

  const gotPlain = stripDiacritics(got);
  if (targets.some((t) => stripDiacritics(t) === gotPlain)) return "accent";

  return "wrong";
}

export type DiffPart = { char: string; state: "ok" | "bad" | "missing" };

/**
 * §7.4 — Levenshtein backtrace, character level.
 *  ok      = character matches the target
 *  bad     = character typed that is wrong or extra
 *  missing = character present in the target but not typed
 */
export function diff(input: string, target: string): DiffPart[] {
  const a = [...input];
  const b = [...target];
  const n = a.length;
  const m = b.length;

  // d[i][j] = edit distance between a[0..i) and b[0..j)
  const d: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 0; i <= n; i++) d[i]![0] = i;
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1, // extra character in the input
        d[i]![j - 1]! + 1, // character missing from the input
        d[i - 1]![j - 1]! + cost,
      );
    }
  }

  const out: DiffPart[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const cost = i > 0 && j > 0 && a[i - 1] === b[j - 1] ? 0 : 1;
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + cost) {
      out.push({ char: a[i - 1]!, state: cost === 0 ? "ok" : "bad" });
      i--;
      j--;
    } else if (j > 0 && d[i]![j] === d[i]![j - 1]! + 1) {
      out.push({ char: b[j - 1]!, state: "missing" });
      j--;
    } else {
      out.push({ char: a[i - 1]!, state: "bad" });
      i--;
    }
  }
  return out.reverse();
}
