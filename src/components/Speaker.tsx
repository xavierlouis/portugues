import { speak, warmUp } from "../lib/speech";

export function Speaker({
  text,
  voice,
  className = "",
}: {
  text: string;
  voice: SpeechSynthesisVoice;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        warmUp(voice);
        speak(text, voice);
      }}
      aria-label={`Ouvir: ${text}`}
      className={`grid h-10 w-10 place-items-center rounded-lg border border-line bg-stone-2
                  text-cobalt active:bg-cobalt-wash ${className}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}
