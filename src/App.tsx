import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import wordsJson from "./data/words.json";
import type { Result, SessionCard, Store, Word } from "./types";
import { wordsFileSchema } from "./lib/words";
import { load, save } from "./lib/storage";
import { today } from "./lib/scheduler";
import { buildSession, dueCount } from "./lib/session";
import { answer } from "./lib/run";
import { onVoices, type VoiceStatus } from "./lib/speech";
import { Home } from "./components/Home";
import { Session } from "./components/Session";
import { Summary, type SessionLog } from "./components/Summary";
import { WordList } from "./components/WordList";
import { Settings } from "./components/Settings";

type View = "home" | "session" | "summary" | "words" | "settings";

// words.json is committed and validated at build time by the enrichment script;
// re-validating here turns a bad hand-edit into a clear failure, not a blank screen.
const WORDS: Word[] = wordsFileSchema.parse(wordsJson);

export default function App() {
  const initial = useRef(load()).current;
  const [store, setStore] = useState<Store>(initial.store);
  const [view, setView] = useState<View>("home");
  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [answered, setAnswered] = useState(0);
  const [planned, setPlanned] = useState(0);
  const [log, setLog] = useState<SessionLog>([]);
  /** The queue as it will be once the user leaves the feedback panel. */
  const [pending, setPending] = useState<SessionCard[] | null>(null);
  const [voice, setVoice] = useState<VoiceStatus>({ kind: "none" });

  useEffect(() => onVoices(setVoice), []);

  const commit = useCallback((next: Store) => {
    setStore(next);
    save(next); // §8 — persisted after every answer, not at session end.
  }, []);

  const due = useMemo(
    () => dueCount(store.cards, WORDS, today(), store.settings.tagFilter),
    [store.cards, store.settings.tagFilter],
  );

  const start = () => {
    const q = buildSession(store.cards, WORDS, {
      size: store.settings.sessionSize,
      tagFilter: store.settings.tagFilter,
    });
    if (q.length === 0) return;
    setQueue(q);
    setPending(null);
    setPlanned(q.length);
    setAnswered(0);
    setLog([]);
    setView("session");
  };

  const onJudge = (card: SessionCard, result: Result) => {
    const step = answer(store, queue, result, today());
    commit(step.store);
    setPending(step.queue);
    setLog((l) => [...l, { card, result }]);
    setAnswered((n) => n + 1);
  };

  const onAdvance = () => {
    const next = pending ?? queue.slice(1);
    setPending(null);
    setQueue(next);
    if (next.length === 0) setView("summary");
  };

  switch (view) {
    case "session":
      return (
        <Session
          queue={queue}
          total={Math.max(planned, answered + (pending ?? queue).length)}
          done={answered}
          voice={voice}
          speechOn={store.settings.speech}
          onJudge={onJudge}
          onAdvance={onAdvance}
          onQuit={() => setView(log.length > 0 ? "summary" : "home")}
        />
      );

    case "summary":
      return (
        <Summary
          log={log}
          dueLeft={due}
          onContinue={start}
          onHome={() => setView("home")}
        />
      );

    case "words":
      return (
        <WordList
          words={WORDS}
          store={store}
          voice={voice}
          speechOn={store.settings.speech}
          onBack={() => setView("home")}
        />
      );

    case "settings":
      return (
        <Settings
          words={WORDS}
          store={store}
          voice={voice}
          onChange={commit}
          onBack={() => setView("home")}
        />
      );

    default:
      return (
        <>
          <Home
            words={WORDS}
            store={store}
            due={due}
            onStudy={start}
            onWords={() => setView("words")}
            onSettings={() => setView("settings")}
          />
          {initial.quarantined && (
            <p className="mx-auto max-w-lg px-4 pb-8 text-sm text-amarelo">
              O progresso guardado estava corrompido. Foi posto de lado em{" "}
              <span className="font-mono break-all">{initial.quarantined}</span> e nada foi
              apagado.
            </p>
          )}
        </>
      );
  }
}
