export const POS_VALUES = [
  "noun",
  "verb",
  "adj",
  "adv",
  "prep",
  "conj",
  "expr",
  "other",
] as const;

export type Pos = (typeof POS_VALUES)[number];

export type Article = "o" | "a" | "os" | "as" | null;

export type Word = {
  /** slug of pt: lowercase, diacritics stripped, spaces -> "-" */
  id: string;
  /** exactly as written in words.txt */
  pt: string;
  /** French translations, first is canonical */
  tr: string[];
  tags: string[];
  pos: Pos;
  /** singular definite article for nouns, null otherwise */
  article: Article;
  /** gender of tr[0] in French, used for the fr>pt prompt marker (§6) */
  trGender: "m" | "f" | null;
  example: { pt: string; tr: string };
  /** ISO date */
  enrichedAt: string;
};

export type Direction = "fr>pt" | "pt>fr" | "cloze";

/** `${word.id}|${direction}` */
export type CardKey = string;

export type Box = 1 | 2 | 3 | 4 | 5;

export type CardState = {
  box: Box;
  /** YYYY-MM-DD, local timezone */
  due: string;
  seen: number;
  lapses: number;
};

export type Result = "correct" | "accent" | "article" | "wrong";

export type SessionSize = 10 | 20 | 40;

export type Settings = {
  sessionSize: SessionSize;
  speech: boolean;
  tagFilter: string[];
};

export type HistoryEntry = { d: string; seen: number; ok: number };

export type Store = {
  v: 1;
  cards: Record<CardKey, CardState>;
  history: HistoryEntry[];
  settings: Settings;
};

export type SessionCard = {
  key: CardKey;
  word: Word;
  direction: Direction;
  /** how many times this card has been re-queued in the current session */
  requeues: number;
};

export const cardKey = (id: string, direction: Direction): CardKey =>
  `${id}|${direction}`;

export const parseCardKey = (
  key: CardKey,
): { id: string; direction: Direction } | null => {
  const i = key.lastIndexOf("|");
  if (i < 0) return null;
  const direction = key.slice(i + 1);
  if (direction !== "fr>pt" && direction !== "pt>fr" && direction !== "cloze")
    return null;
  return { id: key.slice(0, i), direction };
};
