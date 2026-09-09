import type { Result, SessionCard } from "../types";
import { expectedAnswers } from "../lib/words";

export type SessionLog = { card: SessionCard; result: Result }[];

type Props = {
  log: SessionLog;
  dueLeft: number;
  onContinue: () => void;
  onHome: () => void;
};

const DIRECTION_LABEL: Record<SessionCard["direction"], string> = {
  "fr>pt": "fr → pt",
  "pt>fr": "pt → fr",
  cloze: "frase",
};

export function Summary({ log, dueLeft, onContinue, onHome }: Props) {
  // One row per card, judged on its first answer of the session.
  const first = new Map<string, Result>();
  const order: SessionCard[] = [];
  for (const { card, result } of log) {
    if (!first.has(card.key)) {
      first.set(card.key, result);
      order.push(card);
    }
  }
  const missed = order.filter((c) => first.get(c.key) !== "correct");
  const ok = order.length - missed.length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-10 pb-8">
      <header className="rule-tile pb-4">
        <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">Sessão</p>
        <h1 className="mt-1 font-display text-6xl font-bold tracking-tight tabular-nums">
          {ok} <span className="text-muted">/ {order.length}</span>
        </h1>
      </header>

      {missed.length > 0 ? (
        <section className="py-8">
          <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            Para rever
          </p>
          <ul className="flex flex-col gap-2">
            {missed.map((c) => {
              const result = first.get(c.key)!;
              return (
                <li
                  key={c.key}
                  className={`rounded-xl border-l-3 bg-stone-2 px-4 py-3 ${
                    result === "wrong" ? "border-vinho" : "border-amarelo"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-xl font-semibold tracking-tight">
                      {expectedAnswers(c.word, c.direction)[0]}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted uppercase">
                      {DIRECTION_LABEL[c.direction]}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug">{c.word.example.pt}</p>
                  <p className="text-sm text-muted italic">{c.word.example.tr}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="py-8">
          <p className="text-lg">Tudo certo. Boa.</p>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {dueLeft > 0 && (
          <button
            onClick={onContinue}
            className="w-full rounded-xl bg-cobalt px-4 py-4 font-display text-lg font-semibold
                       tracking-tight text-cobalt-ink active:brightness-110"
          >
            Continuar · {dueLeft} {dueLeft === 1 ? "carta" : "cartas"}
          </button>
        )}
        <button
          onClick={onHome}
          className="w-full rounded-xl border border-line bg-stone-2 px-4 py-3.5 font-display
                     text-base font-semibold tracking-tight active:bg-cobalt-wash"
        >
          Início
        </button>
      </div>
    </main>
  );
}
