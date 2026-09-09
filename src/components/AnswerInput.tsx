import { useEffect, useRef } from "react";
import { AccentBar } from "./AccentBar";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** After an answer the input keeps focus (and the iOS keyboard) but is frozen. */
  readOnly: boolean;
  placeholder: string;
};

export function AnswerInput({
  value,
  onChange,
  onSubmit,
  readOnly,
  placeholder,
}: Props) {
  const el = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!readOnly) el.current?.focus();
  }, [readOnly]);

  const insert = (char: string) => {
    const input = el.current;
    if (!input) return;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const next = value.slice(0, start) + char + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + char.length, start + char.length);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {!readOnly && <AccentBar onInsert={insert} />}
      <input
        ref={el}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        // §10 — without these, iOS Safari rewrites Portuguese into French and
        // marks correct answers wrong. Do not remove.
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        autoFocus
        enterKeyHint="go"
        inputMode="text"
        lang="pt-PT"
        aria-label="A tua resposta"
        className="w-full rounded-xl border-2 border-line bg-stone-2 px-4 py-3.5 font-display text-2xl
                   tracking-tight placeholder:font-sans placeholder:text-lg placeholder:tracking-normal
                   placeholder:text-muted focus:border-cobalt focus:outline-none
                   read-only:border-line read-only:text-muted"
      />
    </div>
  );
}
