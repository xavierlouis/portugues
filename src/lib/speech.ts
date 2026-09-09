/**
 * §11 — speechSynthesis only. If there is no Portuguese voice at all we hide
 * every speaker button rather than read Portuguese with a French voice.
 */

export type VoiceStatus =
  | { kind: "pt-PT"; voice: SpeechSynthesisVoice }
  | { kind: "pt-other"; voice: SpeechSynthesisVoice }
  | { kind: "none" };

export function pickVoice(voices: SpeechSynthesisVoice[]): VoiceStatus {
  const pt = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("pt"));
  if (pt.length === 0) return { kind: "none" };

  const exact = pt.find((v) => v.lang.replace("_", "-").toLowerCase() === "pt-pt");
  if (exact) return { kind: "pt-PT", voice: exact };

  return { kind: "pt-other", voice: pt[0]! };
}

const supported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Chrome populates the voice list asynchronously. */
export function onVoices(cb: (status: VoiceStatus) => void): () => void {
  if (!supported()) {
    cb({ kind: "none" });
    return () => {};
  }
  const emit = () => cb(pickVoice(window.speechSynthesis.getVoices()));
  emit();
  window.speechSynthesis.addEventListener("voiceschanged", emit);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", emit);
}

export function speak(text: string, voice: SpeechSynthesisVoice | null): void {
  if (!supported() || !voice) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

let warmed = false;

/** iOS refuses to speak until an utterance has been started by a user gesture. */
export function warmUp(voice: SpeechSynthesisVoice | null): void {
  if (warmed || !supported() || !voice) return;
  warmed = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.voice = voice;
  u.volume = 0;
  window.speechSynthesis.speak(u);
}
