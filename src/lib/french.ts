import { normalize } from "./normalize";

/**
 * French-side helpers for `pt>fr` cards. Portuguese often leaves the form of
 * address implicit (*Qual é o seu nome*, *Quer um café*), and French has
 * several equally correct ways to ask the same question.
 */

export type Register = "tu" | "vous";

const VOUS = new Set(["vous", "votre", "vos", "vôtre", "vôtres"]);
// "t" is the elided "t'" of "tu t'appelles".
const TU = new Set(["tu", "te", "t", "toi", "ton", "ta", "tes"]);

const tokens = (s: string): string[] =>
  // The euphonic "-t-" of "Aime-t-il" is not "t'".
  s.toLowerCase().replace(/-t-/g, "-").match(/\p{L}+/gu) ?? [];

/** Whether a French sentence addresses someone as tu or vous, if at all. */
export function register(fr: string): Register | null {
  const t = tokens(fr);
  if (t.some((x) => VOUS.has(x))) return "vous";
  if (t.some((x) => TU.has(x))) return "tu";
  return null;
}

/** Words that can sit between the pronoun and the verb: "vous y allez". */
const CLITICS = new Set([
  "y", "en", "ne", "n", "me", "m", "te", "t", "se", "s",
  "le", "la", "les", "l", "lui", "leur", "nous", "vous",
]);

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The other ways of asking the same tu/nous/vous question:
 *
 *   Voulez-vous un café ?  <->  Vous voulez un café ?  ->  Est-ce que vous voulez un café ?
 *
 * Only a sentence ending in "?" counts, so the imperative "Asseyez-vous" is left
 * alone. Inversion is only built past a plain verb; "vous y allez" keeps just
 * its est-ce que form rather than risk a wrong one.
 */
export function questionVariants(fr: string): string[] {
  const q = /^(.*?)\s*\?$/.exec(fr.trim());
  if (!q) return [];
  const body = q[1]!;

  const inv = /^(\p{L}+)-(tu|nous|vous)(\s.*)?$/iu.exec(body);
  const declarative = inv
    ? `${inv[2]!.toLowerCase()} ${inv[1]!.toLowerCase()}${inv[3] ?? ""}`
    : /^(tu|nous|vous)\s/iu.test(body)
      ? lowerFirst(body)
      : null;
  if (declarative === null) return [];

  let inverted: string | null = inv ? body : null;
  if (!inverted) {
    const d = /^(tu|nous|vous) (\p{L}+)(\s.*)?$/u.exec(declarative);
    if (d && !CLITICS.has(d[2]!)) inverted = `${upperFirst(d[2]!)}-${d[1]}${d[3] ?? ""}`;
  }

  const forms = [inverted, upperFirst(declarative), `Est-ce que ${declarative}`]
    .filter((f): f is string => f !== null)
    .map((f) => `${f} ?`);
  const own = normalize(fr);
  return forms.filter((f) => normalize(f) !== own);
}

/** `tr` followed by every question variant not already in it, canonical first. */
export function withQuestionVariants(tr: string[]): string[] {
  const out = [...tr];
  const seen = new Set(tr.map(normalize));
  for (const t of tr) {
    for (const v of questionVariants(t)) {
      if (seen.has(normalize(v))) continue;
      seen.add(normalize(v));
      out.push(v);
    }
  }
  return out;
}
