import { useRef, useState } from "react";
import type { SessionSize, Store, Word } from "../types";
import { allTags } from "../lib/words";
import { exportFilename, merge, parseImport } from "../lib/storage";
import type { VoiceStatus } from "../lib/speech";
import { Header } from "./WordList";

const SIZES: SessionSize[] = [10, 20, 40];

type Props = {
  words: Word[];
  store: Store;
  voice: VoiceStatus;
  onChange: (store: Store) => void;
  onBack: () => void;
};

export function Settings({ words, store, voice, onChange, onBack }: Props) {
  const tags = allTags(words);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Store | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resetText, setResetText] = useState("");

  const setSettings = (patch: Partial<Store["settings"]>) =>
    onChange({ ...store, settings: { ...store.settings, ...patch } });

  const doExport = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename();
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const readFile = async (f: File) => {
    setNote(null);
    try {
      setPending(parseImport(await f.text()));
    } catch {
      setPending(null);
      setNote("Esse ficheiro não é uma cópia válida. Nada foi alterado.");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-8 px-4 pt-10 pb-8">
      <Header title="Definições" onBack={onBack} />

      <Group label="Cartas por sessão">
        <div className="flex gap-2">
          {SIZES.map((n) => (
            <button
              key={n}
              onClick={() => setSettings({ sessionSize: n })}
              className={`flex-1 rounded-xl border-2 py-3 font-display text-lg font-semibold tabular-nums ${
                store.settings.sessionSize === n
                  ? "border-cobalt bg-cobalt text-cobalt-ink"
                  : "border-line bg-stone-2"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Voz">
        {voice.kind === "none" ? (
          <p className="text-sm text-muted">
            Este dispositivo não tem voz portuguesa instalada, por isso os botões de áudio
            estão escondidos.
          </p>
        ) : (
          <>
            <Toggle
              on={store.settings.speech}
              onClick={() => setSettings({ speech: !store.settings.speech })}
              label="Ler as palavras em voz alta"
            />
            <p className="mt-2 text-sm text-muted">
              {voice.kind === "pt-PT"
                ? `Voz: ${voice.voice.name} (pt-PT).`
                : `Só há voz brasileira disponível: ${voice.voice.name} (${voice.voice.lang}). A pronúncia não é de Portugal.`}
            </p>
          </>
        )}
      </Group>

      {tags.length > 0 && (
        <Group label="Temas nas sessões">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = store.settings.tagFilter.includes(t);
              return (
                <button
                  key={t}
                  onClick={() =>
                    setSettings({
                      tagFilter: on
                        ? store.settings.tagFilter.filter((x) => x !== t)
                        : [...store.settings.tagFilter, t],
                    })
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    on ? "border-cobalt bg-cobalt text-cobalt-ink" : "border-line bg-stone-2"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted">
            {store.settings.tagFilter.length === 0
              ? "Sem filtro: as sessões usam todas as palavras."
              : "As sessões só usam os temas escolhidos."}
          </p>
        </Group>
      )}

      <Group label="Cópia de segurança">
        <div className="flex flex-col gap-2">
          <Action onClick={doExport}>Guardar cópia</Action>
          <Action onClick={() => file.current?.click()}>Abrir cópia</Action>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void readFile(f);
            }}
          />
        </div>

        {pending && (
          <div className="rise mt-3 rounded-xl border-2 border-cobalt bg-cobalt-wash px-4 py-3.5">
            <p className="text-sm">
              A cópia tem {Object.keys(pending.cards).length} cartas. Este dispositivo tem{" "}
              {Object.keys(store.cards).length}.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  onChange(merge(store, pending));
                  setPending(null);
                  setNote("Cópia juntada: ficou o progresso mais avançado de cada carta.");
                }}
                className="flex-1 rounded-lg bg-cobalt px-3 py-2.5 font-display font-semibold text-cobalt-ink"
              >
                Juntar
              </button>
              <button
                onClick={() => {
                  onChange(pending);
                  setPending(null);
                  setNote("Progresso substituído pela cópia.");
                }}
                className="flex-1 rounded-lg border border-cobalt px-3 py-2.5 font-display font-semibold"
              >
                Substituir
              </button>
              <button onClick={() => setPending(null)} className="px-3 py-2.5 text-sm text-muted">
                Cancelar
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Juntar mantém, para cada carta, a caixa mais alta dos dois lados. Substituir
              apaga o progresso deste dispositivo.
            </p>
          </div>
        )}
        {note && <p className="mt-3 text-sm text-cobalt">{note}</p>}
      </Group>

      <Group label="Apagar progresso">
        <p className="mb-2 text-sm text-muted">
          Apaga todas as caixas e datas neste dispositivo. As palavras ficam. Escreve{" "}
          <span className="font-mono text-basalt">apagar</span> para confirmar.
        </p>
        <div className="flex gap-2">
          <input
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="apagar"
            className="min-w-0 flex-1 rounded-xl border border-line bg-stone-2 px-4 py-3
                       font-mono placeholder:text-muted focus:border-vinho focus:outline-none"
          />
          <button
            disabled={resetText.trim().toLowerCase() !== "apagar"}
            onClick={() => {
              onChange({ ...store, cards: {}, history: [] });
              setResetText("");
              setNote("Progresso apagado.");
            }}
            className="rounded-xl bg-vinho px-4 py-3 font-display font-semibold text-white
                       disabled:bg-stone-3 disabled:text-muted"
          >
            Apagar
          </button>
        </div>
      </Group>
    </main>
  );
}

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section>
    <h2 className="mb-2 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">{label}</h2>
    {children}
  </section>
);

const Action = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="w-full rounded-xl border border-line bg-stone-2 px-4 py-3.5 text-left
               font-display text-base font-semibold tracking-tight active:bg-cobalt-wash"
  >
    {children}
  </button>
);

const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    role="switch"
    aria-checked={on}
    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line
               bg-stone-2 px-4 py-3.5 text-left"
  >
    <span className="font-display text-base font-semibold tracking-tight">{label}</span>
    <span
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-cobalt" : "bg-stone-3"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`}
      />
    </span>
  </button>
);
