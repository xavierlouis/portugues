import type { Store, Word } from "../types";
import { cardKey } from "../types";
import { addDays, today } from "../lib/scheduler";
import { availableDirections } from "../lib/session";

type Props = {
  words: Word[];
  store: Store;
  due: number;
  onStudy: () => void;
  onWords: () => void;
  onSettings: () => void;
};

export function Home({ words, store, due, onStudy, onWords, onSettings }: Props) {
  const boxes = boxCounts(words, store);
  const totalCards = boxes.reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-10 pb-8">
      <header className="rule-tile pb-4">
        <h1 className="font-display text-5xl font-bold tracking-tight">Português</h1>
        <p className="mt-1 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Francês → Português · Lisboa
        </p>
      </header>

      <section className="py-8">
        <button
          onClick={onStudy}
          disabled={due === 0}
          className="w-full rounded-2xl bg-cobalt px-5 py-6 text-left text-cobalt-ink
                     transition active:brightness-110 disabled:bg-stone-2 disabled:text-muted"
        >
          <span className="block font-display text-3xl font-bold tracking-tight">Estudar</span>
          <span className="mt-1 block font-mono text-sm tracking-wide opacity-80">
            {due === 0 ? "nada para hoje" : `${due} ${due === 1 ? "carta" : "cartas"}`}
          </span>
        </button>

        {due === 0 && totalCards > 0 && (
          <p className="mt-3 text-center text-sm text-muted">
            Tudo revisto. Volta {nextDueLabel(words, store)}.
          </p>
        )}
        {words.length === 0 && (
          <p className="mt-3 text-center text-sm text-muted">
            Adiciona palavras a <span className="font-mono">words.txt</span> para começar.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <Label>
            {words.length} {words.length === 1 ? "palavra" : "palavras"} · {totalCards} cartas
          </Label>
          <BoxBar boxes={boxes} />
        </div>

        <div>
          <Label>12 semanas</Label>
          <Heatmap store={store} />
        </div>
      </section>

      <nav className="mt-auto flex gap-2 pt-10">
        <NavButton onClick={onWords}>Palavras</NavButton>
        <NavButton onClick={onSettings}>Definições</NavButton>
      </nav>
    </main>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">{children}</p>
);

const NavButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="flex-1 rounded-xl border border-line bg-stone-2 px-4 py-3.5 font-display
               text-base font-semibold tracking-tight active:bg-cobalt-wash"
  >
    {children}
  </button>
);

/** Cards per box, 1..5. */
function boxCounts(words: Word[], store: Store): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const w of words) {
    for (const d of availableDirections(w, store.cards)) {
      const s = store.cards[cardKey(w.id, d)];
      if (s) counts[s.box - 1]!++;
    }
  }
  return counts;
}

function BoxBar({ boxes }: { boxes: number[] }) {
  const total = boxes.reduce((a, b) => a + b, 0);
  if (total === 0)
    return <div className="h-2.5 w-full rounded-full bg-stone-2" aria-hidden />;

  return (
    <>
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-stone-2">
        {boxes.map((n, i) => (
          <div
            key={i}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(n / total) * 100}%`,
              // Box 1 barely tinted, box 5 full cobalt: the bar fills with colour
              // as words move toward being known.
              background: `color-mix(in oklab, var(--cobalt) ${15 + i * 21}%, var(--stone-3))`,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
        {boxes.map((n, i) => (
          <span key={i}>
            {i + 1}·{n}
          </span>
        ))}
      </div>
    </>
  );
}

const WEEKS = 12;

function Heatmap({ store }: { store: Store }) {
  const byDay = new Map(store.history.map((h) => [h.d, h]));
  const end = today();
  // Wind back to the Monday of the current week so columns are real weeks.
  const dow = (new Date(`${end}T00:00:00`).getDay() + 6) % 7;
  const start = addDays(end, -(dow + (WEEKS - 1) * 7));

  const max = Math.max(1, ...store.history.map((h) => h.seen));
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));

  return (
    <div
      className="grid w-full grid-flow-col grid-rows-7 gap-[3px] [grid-auto-columns:minmax(0,1fr)]"
      role="img" aria-label="Atividade das últimas 12 semanas">
      {cells.map((d) => {
        const h = byDay.get(d);
        const future = d > end;
        return (
          <div
            key={d}
            title={h ? `${d}: ${h.ok}/${h.seen}` : d}
            className="aspect-square rounded-[2px]"
            style={{
              background: future
                ? "transparent"
                : h
                  ? `color-mix(in oklab, var(--cobalt) ${20 + Math.round((h.seen / max) * 80)}%, var(--stone-2))`
                  : "var(--stone-2)",
            }}
          />
        );
      })}
    </div>
  );
}

function nextDueLabel(words: Word[], store: Store): string {
  const ids = new Set(words.map((w) => w.id));
  let soonest: string | null = null;
  for (const [key, s] of Object.entries(store.cards)) {
    if (!ids.has(key.slice(0, key.lastIndexOf("|")))) continue;
    if (soonest === null || s.due < soonest) soonest = s.due;
  }
  if (soonest === null) return "em breve";
  if (soonest === addDays(today(), 1)) return "amanhã";
  return `a ${soonest}`;
}
