import { describe, expect, it } from "vitest";
import { pickVoice } from "./speech";

const voice = (lang: string, name = lang): SpeechSynthesisVoice =>
  ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

describe("pickVoice", () => {
  it("prefers pt-PT", () => {
    const got = pickVoice([voice("fr-FR"), voice("pt-BR"), voice("pt-PT")]);
    expect(got).toMatchObject({ kind: "pt-PT" });
  });

  it("falls back to any pt-* and flags it", () => {
    expect(pickVoice([voice("fr-FR"), voice("pt-BR")])).toMatchObject({ kind: "pt-other" });
  });

  it("tolerates underscore locales and casing", () => {
    expect(pickVoice([voice("pt_PT")])).toMatchObject({ kind: "pt-PT" });
    expect(pickVoice([voice("PT-pt")])).toMatchObject({ kind: "pt-PT" });
  });

  it("reports none rather than reaching for a French voice", () => {
    expect(pickVoice([voice("fr-FR"), voice("en-GB")])).toEqual({ kind: "none" });
    expect(pickVoice([])).toEqual({ kind: "none" });
  });
});
