import { describe, expect, it } from "vitest";
import { questionVariants, register, withQuestionVariants } from "./french";
import { match } from "./normalize";

describe("register", () => {
  it("finds vous in a pronoun or a possessive", () => {
    expect(register("Voulez-vous un café ?")).toBe("vous");
    expect(register("Quel est votre nom ?")).toBe("vous");
    expect(register("Vos amis sont là")).toBe("vous");
  });

  it("finds tu in a pronoun, an elision or a possessive", () => {
    expect(register("Tu as faim ?")).toBe("tu");
    expect(register("Comment t'appelles-tu ?")).toBe("tu");
    expect(register("Quel est ton nom ?")).toBe("tu");
  });

  it("is null when nobody is addressed", () => {
    expect(register("Il a besoin d'un vétérinaire")).toBeNull();
    expect(register("Nous voulons")).toBeNull();
    // euphonic -t-, not t'
    expect(register("Aime-t-il la viande ?")).toBeNull();
  });
});

describe("questionVariants", () => {
  it("turns an inversion into intonation and est-ce que", () => {
    expect(questionVariants("Voulez-vous un café ?")).toEqual([
      "Vous voulez un café ?",
      "Est-ce que vous voulez un café ?",
    ]);
    expect(questionVariants("Savez-vous ?")).toEqual(["Vous savez ?", "Est-ce que vous savez ?"]);
  });

  it("turns intonation into an inversion and est-ce que", () => {
    expect(questionVariants("Tu as faim ?")).toEqual(["As-tu faim ?", "Est-ce que tu as faim ?"]);
  });

  it("does not invert past a clitic", () => {
    expect(questionVariants("Vous y allez à pied ?")).toEqual([
      "Est-ce que vous y allez à pied ?",
    ]);
  });

  it("leaves statements and imperatives alone", () => {
    expect(questionVariants("Vous vous plaignez")).toEqual([]);
    expect(questionVariants("Asseyez-vous")).toEqual([]);
    expect(questionVariants("Où est ?")).toEqual([]);
    expect(questionVariants("Quel est votre nom ?")).toEqual([]);
  });
});

describe("withQuestionVariants", () => {
  it("keeps the canonical answer first and does not repeat one", () => {
    expect(withQuestionVariants(["Voulez-vous un café ?", "Vous voulez un café ?"])).toEqual([
      "Voulez-vous un café ?",
      "Vous voulez un café ?",
      "Est-ce que vous voulez un café ?",
    ]);
  });

  it("marks either word order correct", () => {
    const accepted = withQuestionVariants(["Voulez-vous un café ?"]);
    expect(match("vous voulez un café?", accepted)).toBe("correct");
    expect(match("Voulez-vous un café", accepted)).toBe("correct");
    expect(match("est-ce que vous voulez un cafe ?", accepted)).toBe("accent");
    expect(match("tu veux un café ?", accepted)).toBe("wrong");
  });
});
