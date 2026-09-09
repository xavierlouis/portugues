import { describe, expect, it } from "vitest";
import { addDays, daysOverdue, isDue, newCard, schedule, today } from "./scheduler";
import type { CardState } from "../types";

const on = "2026-09-04";
const card = (box: CardState["box"], extra: Partial<CardState> = {}): CardState => ({
  box,
  due: on,
  seen: 3,
  lapses: 1,
  ...extra,
});

describe("today / addDays", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(today(new Date(2026, 8, 4))).toBe("2026-09-04");
    expect(today(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is not shifted by UTC (the local-midnight trap)", () => {
    expect(addDays("2026-09-04", 0)).toBe("2026-09-04");
  });
});

describe("isDue / daysOverdue", () => {
  it("counts today as due", () => {
    expect(isDue("2026-09-04", on)).toBe(true);
    expect(isDue("2026-09-03", on)).toBe(true);
    expect(isDue("2026-09-05", on)).toBe(false);
  });

  it("measures overdue in days", () => {
    expect(daysOverdue("2026-09-04", on)).toBe(0);
    expect(daysOverdue("2026-08-30", on)).toBe(5);
    expect(daysOverdue("2026-09-10", on)).toBe(-6);
  });
});

describe("newCard", () => {
  it("starts at box 1, due immediately", () => {
    expect(newCard(on)).toEqual({ box: 1, due: on, seen: 0, lapses: 0 });
  });
});

describe("schedule", () => {
  it("promotes on correct and applies the new box interval", () => {
    expect(schedule(card(1), "correct", on)).toMatchObject({ box: 2, due: "2026-09-05" });
    expect(schedule(card(2), "correct", on)).toMatchObject({ box: 3, due: "2026-09-07" });
    expect(schedule(card(3), "correct", on)).toMatchObject({ box: 4, due: "2026-09-11" });
    expect(schedule(card(4), "correct", on)).toMatchObject({ box: 5, due: "2026-09-25" });
  });

  it("keeps a box 5 correct at box 5 with a fresh 21-day due date", () => {
    expect(schedule(card(5), "correct", on)).toMatchObject({ box: 5, due: "2026-09-25" });
  });

  it("demotes one box on an accent miss and stays due today", () => {
    expect(schedule(card(4), "accent", on)).toMatchObject({ box: 3, due: on });
  });

  it("demotes one box on an article miss and stays due today", () => {
    expect(schedule(card(2), "article", on)).toMatchObject({ box: 1, due: on });
  });

  it("keeps a box 1 near miss at box 1", () => {
    expect(schedule(card(1), "accent", on)).toMatchObject({ box: 1, due: on });
    expect(schedule(card(1), "article", on)).toMatchObject({ box: 1, due: on });
  });

  it("resets to box 1 on wrong, from any box", () => {
    expect(schedule(card(5), "wrong", on)).toMatchObject({ box: 1, due: on });
    expect(schedule(card(1), "wrong", on)).toMatchObject({ box: 1, due: on });
  });

  it("counts every answer as seen", () => {
    expect(schedule(card(1), "correct", on).seen).toBe(4);
    expect(schedule(card(1), "wrong", on).seen).toBe(4);
  });

  it("counts lapses only for non-correct answers", () => {
    expect(schedule(card(3), "correct", on).lapses).toBe(1);
    expect(schedule(card(3), "accent", on).lapses).toBe(2);
    expect(schedule(card(3), "article", on).lapses).toBe(2);
    expect(schedule(card(3), "wrong", on).lapses).toBe(2);
  });
});
