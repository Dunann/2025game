import { expect, it } from 'vitest';
import { arrangeCards } from './layout';

it('places all 52 cards in distinct bounded four-column slots', () => {
  const ids = Array.from({ length: 52 }, (_, index) => `card-${index}`);
  const positions = arrangeCards(ids, {}, 52, () => 0.5);
  expect(new Set(Object.values(positions).map(position => position.slot)).size).toBe(52);
  expect(Object.values(positions).every(position => position.slot >= 0 && position.slot < 52)).toBe(true);
  expect(Math.max(...Object.values(positions).map(position => Math.floor(position.slot / 4)))).toBe(12);
});

it('preserves surviving positions and fills freed capacity after a merge', () => {
  const ids = Array.from({ length: 52 }, (_, index) => `card-${index}`);
  const before = arrangeCards(ids, {}, 52, () => 0.5);
  const after = arrangeCards([...ids.slice(2), 'result'], before, 52, () => 0);
  expect(after['card-2']).toEqual(before['card-2']);
  expect(new Set(Object.values(after).map(position => position.slot)).size).toBe(51);
  expect(after.result.slot).toBeLessThan(52);
  expect(Object.keys(arrangeCards(['a', 'b'], {}, 2, () => 0))).toHaveLength(2);
});
