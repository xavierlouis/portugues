import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { KEY, emptyStore, load } from "./lib/storage";
import wordsJson from "./data/words.json";
import { expectedAnswers, wordsFileSchema } from "./lib/words";
import { NEW_CARD_CAP } from "./lib/session";

const words = wordsFileSchema.parse(wordsJson);

/** Reads the prompt and works out what a correct answer would be. */
function answerForCurrentPrompt(): string {
  const eyebrow = screen.getByText(
    /Francês → Português|Português → Francês|Preenche o espaço/,
  ).textContent!;
  const prompt = screen.getByRole("heading", { level: 1 }).textContent!;

  if (eyebrow.startsWith("Francês")) {
    const fr = prompt.replace(/\s*\((m|f)\.\)\s*$/, "").trim();
    const w = words.find((w) => w.tr[0] === fr)!;
    return expectedAnswers(w, "fr>pt")[0]!;
  }
  if (eyebrow.startsWith("Português")) {
    const pt = prompt.replace(/^(os|as|o|a)\s+/, "").trim();
    const w = words.find((w) => w.pt === pt)!;
    return expectedAnswers(w, "pt>fr")[0]!;
  }
  const w = words.find((w) => prompt.includes(w.example.pt.slice(0, 8)))!;
  return expectedAnswers(w, "cloze")[0]!;
}

describe("App", () => {
  it("shows the home screen with the due count", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Português" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Estudar/ }).textContent).toContain(
      `${NEW_CARD_CAP} cartas`,
    );
    expect(screen.getByText(`${words.length} palavras · 0 cartas`)).toBeDefined();
  });

  it("runs a session, persists after each answer, and shows the summary", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Estudar/ }));
    expect(screen.getByText(`0 / ${NEW_CARD_CAP}`)).toBeDefined();

    const input = screen.getByLabelText("A tua resposta");
    await user.type(input, `${answerForCurrentPrompt()}{Enter}`);

    expect(screen.getByText("Certo")).toBeDefined();
    // §8 — written the moment the answer is judged, not on Continuar and not at
    // session end: closing the tab here must lose nothing.
    expect(Object.keys(load().store.cards)).toHaveLength(1);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(screen.getByText(`1 / ${NEW_CARD_CAP}`)).toBeDefined();

    // Enter advances without the input ever losing focus.
    expect(document.activeElement).toBe(input);
    await user.keyboard("{Enter}");

    for (let i = 1; i < NEW_CARD_CAP; i++) {
      await user.type(screen.getByLabelText("A tua resposta"), `${answerForCurrentPrompt()}{Enter}`);
      await user.keyboard("{Enter}");
    }

    expect(screen.getByText("Sessão")).toBeDefined();
    expect(screen.getByText("Tudo certo. Boa.")).toBeDefined();
    expect(load().store.history).toEqual([
      { d: expect.any(String), seen: NEW_CARD_CAP, ok: NEW_CARD_CAP },
    ]);
  });

  it("shows the diff and the correct answer for a wrong answer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Estudar/ }));

    await user.type(screen.getByLabelText("A tua resposta"), "qqqqqq{Enter}");

    expect(screen.getByText("Errado")).toBeDefined();
    expect(screen.getByLabelText("Escreveste qqqqqq")).toBeDefined();
    // The example sentence is always shown after answering.
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeDefined();
  });

  it("marks a bare noun as an article miss, not wrong", async () => {
    // Every word tagged "Trabalho" is a noun, so a fr>pt card in this session
    // is guaranteed to be one — no reliance on the shuffle.
    const trabalho = words.filter((w) => w.tags.includes("Trabalho"));
    expect(trabalho.length).toBeGreaterThan(0);
    expect(trabalho.every((w) => w.pos === "noun")).toBe(true);
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...emptyStore(), settings: { ...emptyStore().settings, tagFilter: ["Trabalho"] } }),
    );

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Estudar/ }));

    for (let guard = 0; guard < 12; guard++) {
      const eyebrow = screen.getByText(
        /Francês → Português|Português → Francês|Preenche o espaço/,
      ).textContent!;
      const answer = answerForCurrentPrompt();
      if (eyebrow.startsWith("Francês")) {
        expect(answer).toMatch(/^(o|a|os|as)\s/);
        await user.type(
          screen.getByLabelText("A tua resposta"),
          `${answer.replace(/^(o|a|os|as)\s+/, "")}{Enter}`,
        );
        expect(screen.getByText("Quase — artigo")).toBeDefined();
        return;
      }
      await user.type(screen.getByLabelText("A tua resposta"), `${answer}{Enter}`);
      await user.keyboard("{Enter}");
    }
    throw new Error("no fr>pt card appeared");
  });

  it("navigates to the word list and back", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Palavras" }));
    expect(screen.getByRole("heading", { name: "Palavras" })).toBeDefined();
    expect(screen.getByText(`${words.length} de ${words.length}`)).toBeDefined();

    await user.type(screen.getByPlaceholderText("Procurar"), "comboio");
    expect(screen.getByText(`1 de ${words.length}`)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Início" }));
    expect(screen.getByRole("heading", { name: "Português" })).toBeDefined();
  });

  it("changes the session size from settings and remembers it", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Definições" }));
    await user.click(screen.getByRole("button", { name: "40" }));
    expect(load().store.settings.sessionSize).toBe(40);

    await user.click(screen.getByRole("button", { name: "Início" }));
    await user.click(screen.getByRole("button", { name: "Definições" }));
    expect(load().store.settings.sessionSize).toBe(40);
  });

  it("requires a typed confirmation before wiping progress", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Estudar/ }));
    await user.type(screen.getByLabelText("A tua resposta"), "qqq{Enter}");
    expect(Object.keys(load().store.cards)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Terminar" }));
    await user.click(screen.getByRole("button", { name: "Início" }));
    await user.click(screen.getByRole("button", { name: "Definições" }));

    const wipe = screen.getByRole("button", { name: "Apagar" });
    expect((wipe as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("apagar"), "apagar");
    expect((wipe as HTMLButtonElement).disabled).toBe(false);
    await user.click(wipe);
    expect(load().store.cards).toEqual({});
  });

  it("recovers from a corrupt store without losing it", () => {
    localStorage.setItem(KEY, "{ this is not json");
    render(<App />);

    expect(screen.getByText(/progresso guardado estava corrompido/)).toBeDefined();
    const quarantined = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
      .find((k) => k.startsWith(`${KEY}:corrupt-`));
    expect(quarantined).toBeDefined();
    expect(localStorage.getItem(quarantined!)).toBe("{ this is not json");
  });

  it("hides the speaker buttons when there is no Portuguese voice", () => {
    render(<App />);
    expect(screen.queryByLabelText(/^Ouvir:/)).toBeNull();
  });
});
