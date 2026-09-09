# Português

A personal PT↔FR vocabulary trainer. Type the answer, get judged strictly on
spelling, with accent and article slips treated as their own gentler category.
Leitner scheduling, progress in `localStorage`, no server and no accounts.

Built to the spec in [`PORTUGUES-SPEC.md`](PORTUGUES-SPEC.md).

## Adding words

`words.txt` is the source of truth and is meant to be edited anywhere,
including on a phone:

```
# Casa
cadeira = chaise
prazo = délai, échéance     # first translation is the one you must type
```

`#` lines are tags; every word inherits the most recent one above it. Then:

```
npm run enrich        # fills in part of speech, article and an example sentence
git commit && git push
```

`src/data/words.json` is its own cache: existing entries are never regenerated,
so example sentences stay stable and diffs stay small. Only new words, and words
whose translation changed, are sent to the API. `--force` re-enriches
everything; `--dry-run` prints without writing.

Enrichment needs `ANTHROPIC_API_KEY` in `.env.local` (gitignored, never used by
the app itself — see `.env.local.example`). You can also just ask Claude Code to
enrich new entries directly, which is how the seed dictionary was written.

## Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | 132 tests: the pure modules, plus a UI pass over the session loop |
| `npm run build` | static output in `dist/` |
| `npm run enrich` | annotate new words in `words.txt` |

## Deploying

Vercel, framework preset **Vite**, no environment variables. Adding words is
edit → enrich → push → live.

## Notes for future edits

Two things are load-bearing and easy to break:

- The answer input carries `autoCorrect="off" autoCapitalize="off"
  spellCheck={false} autoComplete="off"`. Without them iOS Safari rewrites
  Portuguese into French and marks correct answers wrong.
- Custom element styles in `src/index.css` must stay inside `@layer base`.
  Unlayered CSS beats every Tailwind utility regardless of specificity, so a
  bare `button { color: inherit }` silently overrides every `text-*` class.
