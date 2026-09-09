/**
 * npm run enrich  [--force] [--dry-run]
 *
 * Reads words.txt, asks Claude for the grammatical detail and one example
 * sentence per *new or changed* word, and merges the result into
 * src/data/words.json. Existing entries are never regenerated, so example
 * sentences stay stable across runs and diffs stay small.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseWordsTxt, type ParsedWord } from "../src/lib/parse.ts";
import { enrichedSchema, wordsFileSchema } from "../src/lib/words.ts";
import type { Word } from "../src/types.ts";

const ROOT = resolve(import.meta.dirname, "..");
const WORDS_TXT = resolve(ROOT, "words.txt");
const WORDS_JSON = resolve(ROOT, "src/data/words.json");
const ENV_FILE = resolve(ROOT, ".env.local");

const MODEL = "claude-sonnet-4-5";
const BATCH_SIZE = 25;

const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

const SYSTEM = `You annotate European Portuguese vocabulary for a French speaker learning the language.

EUROPEAN PORTUGUESE ONLY. Never Brazilian.
- Use "tu" for informal address, never "você".
- Never use gerund constructions: write "estou a fazer", not "estou fazendo".
- Use European vocabulary and spelling: comboio (not trem), autocarro (not ônibus), casa de banho (not banheiro), pequeno-almoço (not café da manhã).

For each Portuguese word you are given, return:
- "pt": the word exactly as it was given to you, unchanged.
- "pos": one of "noun", "verb", "adj", "adv", "prep", "conj", "expr", "other". Verbs are listed in the infinitive.
- "article": for nouns, the SINGULAR definite article, "o" or "a". For everything else, null. This field is drilled directly by the app and must be correct: Portuguese and French genders disagree often (le voyage -> A viagem, la mer -> O mar).
- "trGender": the gender of the FRENCH translation you are given, "m" or "f", for nouns only; null otherwise. It describes the French word, not the Portuguese one.
- "example": { "pt": ..., "tr": ... }
  - example.pt: ONE sentence, AT MOST 8 WORDS, using the target word in a natural everyday context, understandable to a beginner. Use the word in a form a learner can recognise.
  - example.tr: a natural French translation of that sentence. Translate the meaning, not word for word.

Never invent or alter translations of the headword itself; you are given them and they are not your concern.

Return ONLY a JSON array, one object per input word, in the same order as the input. No prose, no markdown fences.`;

function userPrompt(batch: ParsedWord[]): string {
  const lines = batch.map((w, i) => `${i + 1}. ${w.pt} — French: ${w.tr.join(", ")}`);
  return `Annotate these ${batch.length} Portuguese words:\n\n${lines.join("\n")}`;
}

async function loadApiKey(): Promise<string> {
  let key = process.env.ANTHROPIC_API_KEY;
  if (!key && existsSync(ENV_FILE)) {
    for (const line of (await readFile(ENV_FILE, "utf8")).split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*)$/.exec(line);
      if (m) key = m[1]!.trim().replace(/^["']|["']$/g, "");
    }
  }
  if (!key) {
    console.error(
      `No ANTHROPIC_API_KEY found.\n` +
        `Put it in ${ENV_FILE} as:\n\n  ANTHROPIC_API_KEY=sk-ant-...\n\n` +
        `The key is only ever used here, never by the app.`,
    );
    process.exit(1);
  }
  return key;
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("no JSON array in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callBatch(
  client: Anthropic,
  batch: ParsedWord[],
): Promise<Map<string, z.infer<typeof enrichedSchema>>> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt(batch) }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const arr = z.array(enrichedSchema).parse(extractJson(text));

  // §5 — a returned pt that doesn't match an input word is discarded.
  const wanted = new Map(batch.map((w) => [w.pt.toLowerCase(), w.pt]));
  const out = new Map<string, z.infer<typeof enrichedSchema>>();
  for (const item of arr) {
    const key = wanted.get(item.pt.trim().toLowerCase());
    if (!key) {
      console.warn(`  ! discarded unexpected word from response: "${item.pt}"`);
      continue;
    }
    out.set(key, item);
  }
  return out;
}

async function main() {
  const source = await readFile(WORDS_TXT, "utf8");
  const { words: parsed, warnings } = parseWordsTxt(source);
  for (const w of warnings) console.warn(`words.txt: ${w}`);

  const existing: Word[] = existsSync(WORDS_JSON)
    ? wordsFileSchema.parse(JSON.parse(await readFile(WORDS_JSON, "utf8")))
    : [];
  const byId = new Map(existing.map((w) => [w.id, w]));

  const toEnrich: ParsedWord[] = [];
  let unchanged = 0;
  let changed = 0;
  for (const w of parsed) {
    const prev = byId.get(w.id);
    if (force || !prev) {
      toEnrich.push(w);
    } else if (JSON.stringify(prev.tr) !== JSON.stringify(w.tr)) {
      toEnrich.push(w);
      changed++;
    } else {
      unchanged++;
    }
  }
  const added = toEnrich.length - changed;

  if (toEnrich.length === 0) {
    console.log("Nothing to enrich.");
    return;
  }

  const client = new Anthropic({ apiKey: await loadApiKey() });
  const enriched = new Map<string, z.infer<typeof enrichedSchema>>();
  const skipped: string[] = [];

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    const n = Math.floor(i / BATCH_SIZE) + 1;
    const of = Math.ceil(toEnrich.length / BATCH_SIZE);
    console.log(`Batch ${n}/${of} (${batch.length} words)…`);

    let got: Map<string, z.infer<typeof enrichedSchema>> | null = null;
    for (let attempt = 1; attempt <= 2 && got === null; attempt++) {
      try {
        got = await callBatch(client, batch);
      } catch (err) {
        // §5 — retry once, then skip. A bad batch must never abort the run or
        // corrupt the file.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  attempt ${attempt} failed: ${msg}`);
      }
    }

    if (got === null) {
      skipped.push(...batch.map((w) => w.pt));
      continue;
    }
    for (const w of batch) {
      const item = got.get(w.pt);
      if (item) enriched.set(w.id, item);
      else skipped.push(w.pt);
    }
  }

  const enrichedAt = new Date().toISOString().slice(0, 10);
  const merged = new Map(byId);

  for (const w of parsed) {
    const item = enriched.get(w.id);
    if (!item) continue;
    merged.set(w.id, {
      id: w.id,
      pt: w.pt,
      tr: w.tr, // §5 — tr always comes from words.txt, never from the model.
      tags: w.tags,
      pos: item.pos,
      article: item.pos === "noun" ? item.article : null,
      trGender: item.pos === "noun" ? item.trGender : null,
      example: item.example,
      enrichedAt,
    });
  }

  // Keep tags in step with words.txt even for entries we didn't re-enrich.
  for (const w of parsed) {
    const prev = merged.get(w.id);
    if (prev && !enriched.has(w.id)) merged.set(w.id, { ...prev, tags: w.tags });
  }

  const out = [...merged.values()].sort((a, b) => a.pt.localeCompare(b.pt, "pt"));
  wordsFileSchema.parse(out);

  if (skipped.length > 0) console.warn(`Skipped: ${skipped.join(", ")}`);

  const summary =
    `Enriched ${added} new, ${changed} changed, ${skipped.length} skipped, ${unchanged} unchanged.`;

  if (dryRun) {
    console.log(JSON.stringify(out, null, 2));
    console.log(`\n[dry run — nothing written] ${summary}`);
    return;
  }

  await writeFile(WORDS_JSON, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
