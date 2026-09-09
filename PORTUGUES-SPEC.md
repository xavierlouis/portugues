# Português — Personal PT↔FR Vocabulary Trainer

**Build spec for Claude Code.** Single user (Xavier, Lisbon). Learning European Portuguese from French.

---

## 1. Product in one paragraph

A static web app that drills Portuguese vocabulary by **typing**. The user maintains a plain-text list of `portuguese = french` pairs. A manually-run enrichment script calls an LLM once per new word to add part of speech, definite article, and one short example sentence, writing the result to a committed JSON file. The app loads that JSON at build time, schedules cards with a Leitner box system, and asks the user to type answers. Spelling is checked strictly, with accent errors treated as a distinct, gentler category of wrong. Progress lives in `localStorage`. No server, no database, no auth, no accounts.

**Non-goals:** multi-user, cloud sync, native apps, offline support, grammar lessons, conjugation tables, streaks/XP/hearts, images, paid TTS.

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite | No server-side anything is needed. Fastest correct build. |
| UI | React 18 + TypeScript | Strict mode on. |
| Styles | Tailwind CSS | |
| Validation | Zod | Validates the enrichment LLM output and the localStorage blob. |
| Tests | Vitest | Unit tests for the four pure modules in §7. |
| Enrichment | Node script + `@anthropic-ai/sdk` | Run manually, never at runtime. |
| Hosting | Vercel, static output | `vite build` → `dist/`. Zero config. |

No router library. Three views, switched by a `useState` enum in `App.tsx`.

---

## 3. Repository layout

```
/
├── words.txt                  # SOURCE OF TRUTH — hand-edited by the user
├── src/
│   ├── data/
│   │   └── words.json         # generated, COMMITTED, imported by the app
│   ├── lib/
│   │   ├── normalize.ts       # answer normalization + diffing
│   │   ├── scheduler.ts       # Leitner boxes
│   │   ├── session.ts         # builds a session queue from due cards
│   │   ├── storage.ts         # localStorage read/write/migrate/export/import
│   │   └── speech.ts          # speechSynthesis wrapper
│   ├── components/
│   │   ├── Home.tsx
│   │   ├── Session.tsx
│   │   ├── Summary.tsx
│   │   ├── WordList.tsx
│   │   ├── Settings.tsx
│   │   ├── AnswerInput.tsx
│   │   ├── AccentBar.tsx
│   │   └── Diff.tsx
│   ├── types.ts
│   └── App.tsx
├── scripts/
│   └── enrich.ts              # npm run enrich
├── .env.local                 # ANTHROPIC_API_KEY (gitignored)
└── package.json
```

`npm run enrich` → `tsx scripts/enrich.ts`

---

## 4. The word file

`words.txt` must stay trivially editable on a phone or in any text editor.

```
# Casa
cadeira = chaise
arrumar = ranger
apesar de = malgré

# Trabalho
prazo = délai
```

Rules:

- One pair per line, separated by ` = ` (the first ` = ` splits; later ones are part of the translation).
- Lines starting with `#` are **tags**. Every word inherits the most recent tag above it. Tags are optional and purely for filtering in the UI.
- Blank lines ignored.
- Multiple French translations: comma-separated (`prazo = délai, échéance`). The **first** is the one the user must type; the others are accepted as correct but not shown as the canonical answer.
- The parser must be tolerant: trim everything, ignore duplicate PT entries (keep the first, warn to stdout).

---

## 5. Enrichment (`npm run enrich`)

### Behaviour

1. Parse `words.txt`.
2. Load existing `src/data/words.json` (empty array if absent).
3. Compute the set to enrich: words whose `pt` is absent from the JSON, **or** whose `tr` has changed since. Everything else is left untouched — **the JSON is its own cache and existing entries are never re-generated**, so example sentences stay stable across runs.
4. If the set is empty, print `Nothing to enrich.` and exit 0.
5. Batch the set in groups of 25 and call the Anthropic API once per batch.
6. Validate each returned object with Zod. On validation failure, retry that batch **once**; if it fails again, skip those words, log them, and continue — a bad batch must never abort the run or corrupt the file.
7. Merge into the existing array, sort by `pt`, write `words.json` with 2-space indent and a trailing newline (stable diffs).
8. Print a summary: `Enriched 12 new, 1 changed, 3 skipped, 148 unchanged.`

Flags: `--force` re-enriches everything. `--dry-run` prints without writing.

The API key comes from `ANTHROPIC_API_KEY` in `.env.local`. If missing, exit with a clear message.

### Word schema

```ts
type Word = {
  id: string;            // slug of pt: lowercase, diacritics stripped, spaces → "-"
  pt: string;            // exactly as written in words.txt
  tr: string[];          // French translations, first is canonical
  tags: string[];
  pos: "noun" | "verb" | "adj" | "adv" | "prep" | "conj" | "expr" | "other";
  article: "o" | "a" | "os" | "as" | null;   // null unless pos === "noun"
  example: { pt: string; tr: string };
  enrichedAt: string;    // ISO date
};
```

`id` is the stable key everything else references. It must be derived deterministically from `pt` alone, so progress survives edits to the translation.

### Enrichment prompt requirements

The system prompt must state, explicitly:

- **European Portuguese only.** Not Brazilian. Use *tu* for informal address, never *você*. Avoid gerund constructions (*estou a fazer*, not *estou fazendo*).
- The example sentence must be **at most 8 words**, use the target word in a natural everyday context, and be understandable to a beginner.
- The French translation of the example must be natural French, not word-for-word.
- `article` is the singular definite article (`o`/`a`) for nouns, `null` otherwise. This matters: French and Portuguese genders disagree often (*le voyage* → **a** viagem), and this field is what the app drills.
- Verbs are given in the infinitive.
- Return **only** a JSON array, one object per input word, in input order, with keys `pt`, `pos`, `article`, `example`.

Do not ask the model to invent translations — `tr` always comes from `words.txt`, never from the LLM. If a returned `pt` doesn't match an input word, discard that object.

---

## 6. Cards and scheduling

### Card types

Each word generates up to three independent cards, each with its own box and due date:

| Direction | Prompt | Expected typed answer | Unlocks |
|---|---|---|---|
| `fr>pt` | French translation | the Portuguese word | immediately — **this is the primary exercise** |
| `pt>fr` | Portuguese word | the French translation | immediately |
| `cloze` | example sentence with the word replaced by `____`, plus the French sentence below it | the missing Portuguese word, correctly inflected as it appears in the sentence | once `fr>pt` reaches box 3 |

Card key: `` `${word.id}|${direction}` ``.

For nouns, the `fr>pt` prompt shows `chaise (f.)` and the expected answer is `a cadeira` — **article included**. Accept the bare noun (`cadeira`) as an *article miss*: scored like an accent miss (§7.3), with the article highlighted. This is the cheapest way to drill gender without building a separate exercise type.

### Leitner scheduler

```
box:      1    2    3    4    5
interval: 0d   1d   3d   7d   21d
```

- New card starts at box 1, due immediately.
- **Correct** → `box = min(box + 1, 5)`, `due = today + interval[box]`.
- **Near miss** (accent or article, §7.3) → `box = max(box - 1, 1)`, due immediately in the same session (re-queued, see §8).
- **Wrong** → `box = 1`, due immediately in the same session.
- A card at box 5 answered correctly stays at box 5 with a fresh 21-day due date.

`due` is a plain `YYYY-MM-DD` string in the user's local timezone. "Due" means `due <= today`. No hour-level scheduling — this is a personal app, not an SRS competition.

---

## 7. Answer checking

The most important module in the app. Pure functions, fully unit-tested.

### 7.1 Normalization

```ts
normalize(s: string): string
```
Trim → collapse internal whitespace → lowercase → strip leading/trailing punctuation (`.,;:!?"'`) → NFC-normalize Unicode.

Note: NFC, not NFD. Text typed on macOS with dead keys can arrive decomposed; without normalization `ç` typed two ways compares unequal.

```ts
stripDiacritics(s: string): string
```
NFD → remove `\p{Diacritic}` → NFC. Must map `ç → c`, `ã → a`, `ê → e`, `ó → o`, `ü → u`.

### 7.2 Matching

Given `input` and the array of `accepted` answers (canonical first, plus alternates from §4 for `pt>fr`):

1. `normalize(input)` equals any `normalize(accepted)` → **correct**.
2. For `fr>pt` on a noun: input equals the accepted answer minus its leading article → **article miss**.
3. `stripDiacritics(normalize(input))` equals any `stripDiacritics(normalize(accepted))` → **accent miss**.
4. Otherwise → **wrong**.

Order matters: check exact before stripped, always.

### 7.3 Result categories

| Result | Scored as | Feedback |
|---|---|---|
| correct | promote | green, brief |
| accent miss | demote one box | amber, diff showing the wrong characters, target shown |
| article miss | demote one box | amber, `a cadeira` with the article highlighted |
| wrong | reset to box 1 | red, character diff, target shown |

### 7.4 Diff

```ts
diff(input: string, target: string): Array<{ char: string; state: "ok" | "bad" | "missing" }>
```

A simple Levenshtein-backtrace character diff is sufficient and is what makes the near-miss feedback useful. Render `ok` in muted grey, `bad` in red with a strikethrough, `missing` in red on a light red background. Show the input diff above the correct target.

---

## 8. Session engine

```ts
buildSession(cards, words, opts): SessionCard[]
```

1. Collect all cards where `due <= today`, plus new cards that have never been seen, up to the session cap.
2. Cap at `opts.size` (default **20**, settable to 10 / 20 / 40 in Settings).
3. Prioritize: overdue cards first (most overdue first), then due, then new. Cap new cards at 8 per session so a big import doesn't bury reviews.
4. Shuffle within priority tiers, then apply one constraint: **two cards of the same `word.id` must never be adjacent**. Re-shuffle locally if violated.
5. During the session, a card answered wrong or near-miss is pushed back into the queue at a position ≥4 cards later (or the end if the queue is shorter). It must be answered correctly once before the session ends. A card can be re-queued at most twice, then it's dropped for the day.

Progress is persisted **after every answer**, not at session end. Closing the tab mid-session must lose nothing.

---

## 9. Storage

Single localStorage key: `pt-trainer:v1`.

```ts
type Store = {
  v: 1;
  cards: Record<string, { box: 1|2|3|4|5; due: string; seen: number; lapses: number }>;
  history: Array<{ d: string; seen: number; ok: number }>;  // one entry per day
  settings: { sessionSize: 10|20|40; speech: boolean; tagFilter: string[] };
};
```

Rules:

- Validate on load with Zod. On any parse or validation failure, **do not wipe** — rename the key to `pt-trainer:v1:corrupt-<timestamp>` and start fresh, so nothing is silently lost.
- Card keys referencing a `word.id` no longer in `words.json` are ignored at runtime but **kept** in storage — the user may re-add the word later.
- `history` keeps the last 365 days.
- **Export**: downloads `pt-progress-YYYY-MM-DD.json` (the whole `Store`).
- **Import**: file picker, validate, then offer *Replace* or *Merge*. Merge takes, per card key, the entry with the **higher box**; ties go to the later `due`. This is the manual laptop↔phone reconciliation path — it must be obvious in the UI and it must not need explanation.

---

## 10. UI

Mobile-first, single column, `max-w-lg` centred. Everything reachable in one thumb reach. Dark mode via `prefers-color-scheme`.

### Home

- Big primary button: **Estudar** — shows `23 cartas` (due count). Disabled with a friendly message when nothing is due.
- Under it: total words, cards per box as a small 5-segment bar, and a 12-week contribution-style heatmap from `history`.
- Secondary links: *Palavras* (word list), *Definições* (settings).

### Session

- Thin progress bar at the top (`7 / 20`).
- Prompt, large and centred. For `pt>fr` and `cloze`, a speaker button (§11).
- For `fr>pt` nouns, the prompt shows the French word with its French gender marker — the point is that the user must produce the *Portuguese* gender.
- One text input, autofocused.
- **AccentBar**: a horizontal row of `á à â ã ç é ê í ó ô õ ú` buttons directly above the input, inserting at the cursor position. Shown only on touch devices (`pointer: coarse`). Non-negotiable for phone use.
- `Enter` submits. After feedback, `Enter` advances. Never require a mouse.
- Feedback panel: result category, diff, the correct answer, and the example sentence with its French translation (always shown after answering — free extra exposure, zero extra work).

**The input element must carry `autoCorrect="off" autoCapitalize="off" spellCheck={false} autoComplete="off"` and `enterKeyHint="go"`.** Without these, iOS Safari rewrites Portuguese into French and correct answers are marked wrong. This is the single most common way this app can be broken.

### Summary

`17 / 20`. Lists the cards that were wrong, with their example sentences. A *Continuar* button that starts another session if more cards are still due.

### Word list

Searchable and tag-filterable table of every word: `pt`, article, `tr`, box level per direction, next due date. A speaker button per row. Read-only — editing happens in `words.txt`.

### Settings

Session size · speech on/off · tag filter (restrict sessions to selected tags) · Export · Import · Reset progress (with a typed confirmation).

---

## 11. Speech

`window.speechSynthesis`, no library, no API key.

- On mount, resolve a voice: prefer `lang === "pt-PT"`; fall back to any `pt-*` (and note in Settings that the accent is Brazilian); if none, hide every speaker button entirely rather than reading Portuguese with a French voice.
- `rate: 0.9`, `pitch: 1`.
- Voice list loads asynchronously in Chrome — handle `voiceschanged`.
- Auto-speak the Portuguese after answering a `fr>pt` card, if speech is enabled. Never auto-speak the prompt of a `fr>pt` card, which would give the answer away.
- iOS requires a user gesture before the first utterance: trigger a silent warm-up utterance on the first tap of the session.

---

## 12. Tests (Vitest)

Required coverage — these four modules are where real bugs live:

- `normalize`: dead-key composed vs decomposed input; `ç`/`ã`/`õ` handling; case; punctuation; whitespace.
- `matching`: exact, accent miss, article miss, wrong, and multi-translation alternates. Explicitly assert that `coracao` vs `coração` is an accent miss and `cadeira` vs `a cadeira` is an article miss.
- `scheduler`: box transitions for all four result categories; box 5 correct stays at 5; box 1 wrong stays at 1.
- `session`: cap respected, new-card cap respected, no two cards of the same word adjacent, re-queue rules.
- `storage`: corrupt blob is quarantined not wiped; merge picks the higher box.

---

## 13. Deployment

- `vite build` → `dist/`. Vercel: framework preset Vite, no environment variables (the API key is only ever used locally by the enrichment script).
- Adding words is: edit `words.txt` → `npm run enrich` → `git commit && git push` → live in ~40 s.
- Add a `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and `<meta name="theme-color">`. Add an `apple-mobile-web-app-capable` meta and an icon so *Add to Home Screen* looks right, even though there's no service worker.

---

## 14. Build order

1. Types, `words.txt` parser, and a hand-written `words.json` with ~10 words. No UI.
2. `normalize` / `matching` / `diff` with tests. Nothing else until these are green.
3. `scheduler` + `storage` with tests.
4. Session view: prompt → input → check → feedback → next. Ugly is fine.
5. `session.ts` queue building, wired to storage.
6. Home + Summary.
7. `scripts/enrich.ts`, run against the real word list.
8. Word list, Settings, Export/Import.
9. AccentBar, speech, styling pass, dark mode.
10. Deploy, then test typing on the actual phone before calling it done — step 4 and step 10 are where the autocorrect problem surfaces.
