import { useMemo, useState } from "react";
import type { Direction, Store, Word } from "../types";
import { cardKey } from "../types";
import { allTags, isNoun } from "../lib/words";
import { stripDiacritics } from "../lib/normalize";
import { Speaker } from "./Speaker";
import type { VoiceStatus } from "../lib/speech";

const DIRS: Direction[] = ["fr>pt", "pt>fr", "cloze"];
const DIR_SHORT: Record<Direction, string> = { "fr>pt": "F→P", "pt>fr": "P→F", cloze: "Frase" };

export function WordList({
  words,
  store,
  voice,
  speechOn,
  onBack,
}: {
  words: Word[];
  store: Store;
  voice: VoiceStatus;
  speechOn: boolean;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => allTags(words), [words]);
  const voiceObj = speechOn && voice.kind !== "none" ? voice.voice : null;

  const shown = useMemo(() => {
    const needle = stripDiacritics(q.trim().toLowerCase());
    return words.filter((w) => {
      if (tag !== null && !w.tags.includes(tag)) return false;
      if (needle === "") return true;
      const hay = stripDiacritics(`${w.pt} ${w.tr.join(" ")}`.toLowerCase());
      return hay.includes(needle);
    });
  }, [words, q, tag]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-10 pb-8">
      <Header title="Palavras" onBack={onBack} />

      <div className="sticky top-0 z-10 -mx-4 bg-stone px-4 pt-4 pb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar"
          type="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-stone-2 px-4 py-3 text-base
                     placeholder:text-muted focus:border-cobalt focus:outline-none"
        />
        {tags.length > 0 && (
          <div className="-mx-4 mt-2 overflow-x-auto px-4">
            <div className="flex gap-1.5">
              <Chip active={tag === null} onClick={() => setTag(null)}>
                Todas
              </Chip>
              {tags.map((t) => (
                <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="pb-2 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        {shown.length} de {words.length}
      </p>

      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {shown.map((w) => (
          <li key={w.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold tracking-tight">
                {isNoun(w) && <span className="text-cobalt">{w.article} </span>}
                {w.pt}
              </p>
              <p className="text-sm text-muted">{w.tr.join(", ")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DIRS.map((d) => {
                  const s = store.cards[cardKey(w.id, d)];
                  if (!s) return null;
                  return (
                    <span
                      key={d}
                      title={`Próxima revisão: ${s.due}`}
                      className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-wide"
                      style={{
                        background: `color-mix(in oklab, var(--cobalt) ${10 + s.box * 14}%, var(--stone-2))`,
                      }}
                    >
                      {DIR_SHORT[d]} · {s.box} · {s.due.slice(5)}
                    </span>
                  );
                })}
              </div>
            </div>
            {voiceObj && <Speaker text={w.pt} voice={voiceObj} className="mt-0.5" />}
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="py-8 text-center text-muted">Nenhuma palavra corresponde.</p>
      )}
    </main>
  );
}

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="rule-tile flex items-baseline justify-between pb-3">
      <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
      <button onClick={onBack} className="-m-2 p-2 text-sm text-muted underline underline-offset-4">
        Início
      </button>
    </header>
  );
}

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
      active
        ? "border-cobalt bg-cobalt text-cobalt-ink"
        : "border-line bg-stone-2 text-basalt-2"
    }`}
  >
    {children}
  </button>
);
