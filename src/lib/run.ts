import type { Result, SessionCard, Store } from "../types";
import { newCard, schedule, today } from "./scheduler";
import { recordAnswer } from "./storage";
import { requeue } from "./session";

export type Step = { store: Store; queue: SessionCard[] };

/**
 * One answer: reschedule the card, log it against today, and decide what the
 * rest of the session queue looks like. The store it returns is written to
 * localStorage immediately — closing the tab mid-session loses nothing (§8).
 */
export function answer(
  store: Store,
  queue: SessionCard[],
  result: Result,
  on: string = today(),
): Step {
  const card = queue[0];
  if (!card) return { store, queue };

  const prev = store.cards[card.key] ?? newCard(on);
  const next = recordAnswer(
    { ...store, cards: { ...store.cards, [card.key]: schedule(prev, result, on) } },
    result === "correct",
    on,
  );

  const rest = queue.slice(1);
  return { store: next, queue: result === "correct" ? rest : requeue(rest, card) };
}
