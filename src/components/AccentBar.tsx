import { useEffect, useState } from "react";

const KEYS = ["á", "à", "â", "ã", "ç", "é", "ê", "í", "ó", "ô", "õ", "ú"];

/** §10 — touch only. On a laptop the dead keys already work. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return coarse;
}

export function AccentBar({ onInsert }: { onInsert: (char: string) => void }) {
  const coarse = useCoarsePointer();
  if (!coarse) return null;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex gap-1.5" role="group" aria-label="Acentos">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            // Keep the keyboard up: mousedown/touch would blur the input first.
            onPointerDown={(e) => {
              e.preventDefault();
              onInsert(k);
            }}
            className="h-11 min-w-11 shrink-0 rounded-lg border border-line bg-stone-2 font-display text-xl
                       active:bg-cobalt-wash"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
