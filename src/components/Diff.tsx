import { diff } from "../lib/normalize";

/**
 * The calçada strip: every character sits in its own cell, so a missing accent
 * lines up under the letter it belongs to instead of shifting the whole word.
 */
export function Diff({ input, target }: { input: string; target: string }) {
  const parts = diff(input, target);

  return (
    <p className="flex flex-wrap justify-center gap-px font-mono text-2xl" aria-label={`Escreveste ${input}`}>
      {parts.map((p, i) => {
        const base = "inline-grid h-9 min-w-[1.1rem] place-items-center px-px";
        if (p.state === "ok")
          return (
            <span key={i} className={`${base} text-muted`}>
              {p.char === " " ? " " : p.char}
            </span>
          );
        if (p.state === "bad")
          return (
            <span key={i} className={`${base} text-vinho line-through decoration-2`}>
              {p.char === " " ? " " : p.char}
            </span>
          );
        return (
          <span key={i} className={`${base} rounded-xs bg-vinho-wash text-vinho`}>
            {p.char === " " ? " " : p.char}
          </span>
        );
      })}
    </p>
  );
}

/** The correct answer, with the article picked out — §7.3 for an article miss. */
export function Target({ text, highlightArticle }: { text: string; highlightArticle?: boolean }) {
  const m = highlightArticle ? /^(os|as|o|a)(\s+)(.*)$/.exec(text) : null;

  return (
    <p className="font-display text-3xl font-semibold tracking-tight">
      {m ? (
        <>
          <span className="rounded-sm bg-amarelo-wash px-1.5 text-amarelo underline decoration-2 underline-offset-4">
            {m[1]}
          </span>
          {m[2]}
          {m[3]}
        </>
      ) : (
        text
      )}
    </p>
  );
}
