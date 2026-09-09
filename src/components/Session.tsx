import { useEffect, useMemo, useRef, useState } from "react";
import type { Result, SessionCard, Word } from "../types";
import { match } from "../lib/normalize";
import { cloze, expectedAnswers, frenchGender, isNoun } from "../lib/words";
import { AnswerInput } from "./AnswerInput";
import { Diff, Target } from "./Diff";
import { Speaker } from "./Speaker";
import type { VoiceStatus } from "../lib/speech";
import { speak, warmUp } from "../lib/speech";

type Props = {
  queue: SessionCard[];
  total: number;
  done: number;
  voice: VoiceStatus;
  speechOn: boolean;
  /** Called the moment an answer is judged, so it is persisted immediately. */
  onJudge: (card: SessionCard, result: Result) => void;
  /** Called when the user moves on to the next card. */
  onAdvance: () => void;
  onQuit: () => void;
};

const LABEL: Record<Result, string> = {
  correct: "Certo",
  accent: "Quase — acento",
  article: "Quase — artigo",
  wrong: "Errado",
};

const TONE: Record<Result, string> = {
  correct: "text-verde",
  accent: "text-amarelo",
  article: "text-amarelo",
  wrong: "text-vinho",
};

export function Session({
  queue,
  total,
  done,
  voice,
  speechOn,
  onJudge,
  onAdvance,
  onQuit,
}: Props) {
  const card = queue[0];
  const [typed, setTyped] = useState("");
  const [judged, setJudged] = useState<Result | null>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  const voiceObj = speechOn && voice.kind !== "none" ? voice.voice : null;

  const view = useMemo(() => (card ? describe(card) : null), [card]);

  useEffect(() => {
    setTyped("");
    setJudged(null);
  }, [card?.key, card?.requeues]);

  if (!card || !view) return null;

  const submit = () => {
    if (judged !== null) {
      onAdvance();
      return;
    }
    if (typed.trim() === "") return;

    warmUp(voiceObj);
    const result = match(typed, view.accepted, {
      allowArticleMiss: card.direction === "fr>pt" && isNoun(card.word),
    });
    setJudged(result);
    // §8 — persisted here, not on Continuar: closing the tab while the feedback
    // panel is open must not lose the answer.
    onJudge(card, result);

    // §11 — speak the Portuguese only once it can no longer give the answer away.
    if (voiceObj && card.direction === "fr>pt") speak(view.spoken, voiceObj);
  };

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-10 bg-stone">
        <div className="h-[3px] w-full bg-stone-3">
          <div
            className="h-full bg-cobalt transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2.5">
          <span className="font-mono text-xs tracking-widest text-muted">
            {done} / {total}
          </span>
          <button
            onClick={onQuit}
            className="-m-2 p-2 text-sm text-muted underline underline-offset-4"
          >
            Terminar
          </button>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4">
        <section
          className={`flex flex-col py-8 ${judged === null ? "flex-1 justify-center" : ""}`}
        >
          <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            {view.eyebrow}
          </p>

          <div className="rule-tile pb-4">
            <div className="flex items-start gap-3">
              <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance">
                {view.prompt}
                {view.gender && (
                  <span className="ml-2 align-middle font-sans text-lg font-normal text-muted">
                    ({view.gender})
                  </span>
                )}
              </h1>
              {view.speakable && voiceObj && (
                <Speaker text={view.spoken} voice={voiceObj} className="mt-1.5 shrink-0" />
              )}
            </div>
            {view.sub && (
              <p className="mt-2 text-base text-muted italic">{view.sub}</p>
            )}
          </div>
        </section>

        {/* Reads top to bottom: prompt, what you typed, what was right, next.
            The input stays mounted and focused throughout, so Enter always
            advances and iOS never dismisses the keyboard mid-session. */}
        <section className="mt-auto flex flex-col gap-4 pb-6">
          <AnswerInput
            value={typed}
            onChange={setTyped}
            onSubmit={submit}
            readOnly={judged !== null}
            placeholder={view.placeholder}
          />
          {judged !== null && (
            <Feedback
              result={judged}
              typed={typed}
              card={card}
              accepted={view.accepted}
              onNext={submit}
              nextRef={nextBtn}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function Feedback({
  result,
  typed,
  card,
  accepted,
  onNext,
  nextRef,
}: {
  result: Result;
  typed: string;
  card: SessionCard;
  accepted: string[];
  onNext: () => void;
  nextRef: React.Ref<HTMLButtonElement>;
}) {
  const target = accepted[0]!;
  const showDiff = result !== "correct";

  return (
    <div className="rise flex flex-col gap-4">
      <div
        className={`rounded-xl border-2 px-4 py-4 ${
          result === "correct"
            ? "border-verde/40 bg-verde/8"
            : result === "wrong"
              ? "border-vinho/40 bg-vinho-wash"
              : "border-amarelo/40 bg-amarelo-wash"
        }`}
      >
        <p className={`font-mono text-[11px] tracking-[0.18em] uppercase ${TONE[result]}`}>
          {LABEL[result]}
        </p>

        {showDiff && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <Diff input={typed} target={target} />
            <span aria-hidden className="text-muted">↓</span>
            <Target text={target} highlightArticle={result === "article"} />
          </div>
        )}
        {!showDiff && (
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{target}</p>
        )}

        {accepted.length > 1 && (
          <p className="mt-3 text-sm text-muted">
            Também aceite: {accepted.slice(1).join(", ")}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-stone-2 px-4 py-3.5">
        <p className="font-display text-lg leading-snug tracking-tight">
          {card.word.example.pt}
        </p>
        <p className="mt-1 text-sm text-muted italic">{card.word.example.tr}</p>
      </div>

      <button
        ref={nextRef}
        onClick={onNext}
        className="w-full rounded-xl bg-cobalt px-4 py-4 font-display text-lg font-semibold tracking-tight
                   text-cobalt-ink active:brightness-110"
      >
        Continuar <span className="ml-1 font-sans text-sm font-normal opacity-70">↵</span>
      </button>
    </div>
  );
}

type View = {
  eyebrow: string;
  prompt: string;
  sub: string | null;
  gender: string | null;
  accepted: string[];
  placeholder: string;
  spoken: string;
  speakable: boolean;
};

function describe(card: SessionCard): View {
  const w: Word = card.word;
  const accepted = expectedAnswers(w, card.direction);

  if (card.direction === "fr>pt") {
    return {
      eyebrow: "Francês → Português",
      prompt: w.tr[0]!,
      sub: null,
      // §10 — the French gender is given; producing the Portuguese one is the exercise.
      gender: frenchGender(w),
      accepted,
      placeholder: isNoun(w) ? "artigo + palavra" : "em português",
      spoken: accepted[0]!,
      speakable: false,
    };
  }

  if (card.direction === "pt>fr") {
    return {
      eyebrow: "Português → Francês",
      prompt: isNoun(w) ? `${w.article} ${w.pt}` : w.pt,
      sub: null,
      gender: null,
      accepted,
      placeholder: "em francês",
      spoken: w.pt,
      speakable: true,
    };
  }

  const c = cloze(w);
  return {
    eyebrow: "Preenche o espaço",
    prompt: c?.text ?? w.example.pt,
    sub: w.example.tr,
    gender: null,
    accepted,
    placeholder: "a palavra que falta",
    spoken: w.example.pt,
    speakable: true,
  };
}
