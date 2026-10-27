export type Position = { slot: number; tilt: number };

/** Fixed starting-hand capacity keeps committed cards in place as a run shrinks. */
export function arrangeCards(ids: string[], previous: Record<string, Position>, capacity: number, random = Math.random): Record<string, Position> {
  const next: Record<string, Position> = {};
  const available = Array.from({ length: Math.max(8, capacity, ids.length) }, (_, slot) => slot);
  for (const id of ids) {
    const old = previous[id];
    if (old && available.includes(old.slot)) {
      next[id] = old;
      available.splice(available.indexOf(old.slot), 1);
    }
  }
  for (const id of ids) {
    if (!next[id]) {
      const index = Math.floor(random() * available.length);
      next[id] = { slot: available.splice(index, 1)[0], tilt: random() * 6 - 3 };
    }
  }
  return next;
}
