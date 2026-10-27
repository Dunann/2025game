import { describe, expect, it } from 'vitest';
import type { GameState, GameValue, Operation, SourceCard } from '../types';
import { createGame, drawHand, formatExpression, formatValue, hasWon, mergeCards, undoMerge } from './index';

const fixture: SourceCard[] = [1, 2, 3, 4, 5, 6, 10, 13].map(rank => ({ id: `original-${rank}`, rank, suit: 'spades' }));
const value = (numerator: bigint, denominator = 1n): GameValue => ({ numerator, denominator });
const powerConfig = { cardCount: 8, target: '2025', exponentiationEnabled: true };

function calculate(a: GameValue, operation: Operation, b: GameValue) {
  const state = createGame(fixture, powerConfig);
  state.cards[0] = { ...state.cards[0], value: a };
  state.cards[1] = { ...state.cards[1], value: b };
  const result = mergeCards(state, state.cards[0].id, operation, state.cards[1].id);
  return { result, state };
}

function successfulValue(a: GameValue, operation: Operation, b: GameValue) {
  const { result } = calculate(a, operation, b);
  if (!result.ok) throw new Error(result.error);
  return result.state.cards.find(card => card.id === result.resultCardId)!.value;
}

describe('deck and restart', () => {
  it('draws eight physically distinct cards with valid ranks, allowing repeated ranks', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const hand = drawHand();
      expect(hand).toHaveLength(8);
      expect(new Set(hand.map(card => card.id)).size).toBe(8);
      expect(new Set(hand.map(card => `${card.rank}:${card.suit}`)).size).toBe(8);
      expect(hand.every(card => card.rank >= 1 && card.rank <= 13)).toBe(true);
    }
    expect(drawHand(() => 0).map(card => card.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const repeated = fixture.map((card, index) => index < 4 ? { ...card, rank: 1, suit: (['clubs', 'diamonds', 'hearts', 'spades'] as const)[index] } : card);
    expect(createGame(repeated).cards).toHaveLength(8);
  });

  it('replays rank/suit with fresh identities and rejects malformed hands', () => {
    const first = createGame(fixture);
    const restarted = createGame(first.initialHand);
    expect(restarted.initialHand.map(({ rank, suit }) => ({ rank, suit }))).toEqual(fixture.map(({ rank, suit }) => ({ rank, suit })));
    expect(restarted.initialHand.every(card => !first.initialHand.some(old => old.id === card.id))).toBe(true);
    expect(restarted.history).toEqual([]);
    expect(() => createGame(fixture.slice(1))).toThrow();
    expect(() => createGame(fixture.map(() => fixture[0]))).toThrow();
    expect(() => drawHand(() => 1)).toThrow();
  });
});

describe('exact ordered arithmetic', () => {
  it.each([
    [value(1n, 3n), 'add', value(1n, 6n), value(1n, 2n)],
    [value(3n), 'subtract', value(8n), value(-5n)],
    [value(3n), 'divide', value(8n), value(3n, 8n)],
    [value(2n, 3n), 'multiply', value(9n, 4n), value(3n, 2n)],
    [value(-2n), 'power', value(3n), value(-8n)],
    [value(2n, 3n), 'power', value(-3n), value(27n, 8n)],
    [value(5n), 'power', value(0n), value(1n)],
    [value(0n), 'power', value(2n), value(0n)],
  ] as [GameValue, Operation, GameValue, GameValue][])('%o %s %o yields %o', (a, operation, b, expected) => {
    expect(successfulValue(a, operation, b)).toEqual(expected);
  });

  it.each([
    [value(2n), 'divide', value(0n), 'zero'],
    [value(0n), 'power', value(0n), 'undefined'],
    [value(0n), 'power', value(-1n), 'negative'],
    [value(4n), 'power', value(1n, 2n), 'integer'],
    [value(2n), 'power', value(1025n), '1024'],
    [value(2n), 'power', value(-1025n), '1024'],
    [value(16n), 'power', value(1024n), '4096'],
    [value(1n, 16n), 'power', value(1024n), '4096'],
  ] as [GameValue, Operation, GameValue, string][])('rejects invalid arithmetic and preserves state', (a, operation, b, error) => {
    const { result, state } = calculate(a, operation, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(error);
    expect(state.cards).toHaveLength(8);
    expect(state.cards[0].value).toEqual(a);
    expect(state.history).toEqual([]);
  });

  it('accepts limit edges and cancels fractions before checking product size', () => {
    expect(successfulValue(value(2n), 'power', value(1024n))).toEqual(value(2n ** 1024n));
    const large = 2n ** 4095n;
    expect(successfulValue(value(large), 'multiply', value(1n, large))).toEqual(value(1n));
    expect(calculate(value(large), 'multiply', value(2n)).result.ok).toBe(false);
  });
});

describe('state transitions and winning', () => {
  it('rejects same-card, missing-card, and overlapping-source merges', () => {
    const state = createGame(fixture);
    expect(mergeCards(state, state.cards[0].id, 'add', state.cards[0].id).ok).toBe(false);
    expect(mergeCards(state, state.cards[0].id, 'add', 'missing').ok).toBe(false);
    state.cards[1] = { ...state.cards[1], sourceIds: [...state.cards[0].sourceIds] };
    expect(mergeCards(state, state.cards[0].id, 'add', state.cards[1].id).ok).toBe(false);
  });

  it('preserves the prior board, tracks ancestry and undoes a committed merge', () => {
    const before = createGame(fixture);
    const result = mergeCards(before, before.cards[0].id, 'add', before.cards[1].id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(before.cards).toHaveLength(8);
    expect(result.state.cards).toHaveLength(7);
    const card = result.state.cards.at(-1)!;
    expect(before.cards.some(old => old.id === card.id)).toBe(false);
    expect(card.sourceIds).toEqual([before.cards[0].id, before.cards[1].id]);
    expect(formatExpression(card.expression)).toBe('(1 + 2)');
    expect(undoMerge(result.state).cards).toEqual(before.cards);
    expect(undoMerge(before)).toBe(before);
  });

  it('wins the full eight-card fixture after exactly seven merges', () => {
    let state: GameState = createGame(fixture, powerConfig);
    const ranks = new Map(state.initialHand.map(card => [card.rank, card.id]));
    function merge(first: string, operation: Operation, second: string) {
      const result = mergeCards(state, first, operation, second);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      return result.resultCardId;
    }
    const three = merge(ranks.get(13)!, 'subtract', ranks.get(10)!);
    const ten = merge(ranks.get(6)!, 'add', ranks.get(4)!);
    const fifteen = merge(ten, 'add', ranks.get(5)!);
    const fortyFive = merge(three, 'multiply', fifteen);
    const four = merge(ranks.get(3)!, 'add', ranks.get(1)!);
    const two = merge(four, 'subtract', ranks.get(2)!);
    expect(hasWon(state)).toBe(false);
    merge(fortyFive, 'power', two);
    expect(hasWon(state)).toBe(true);
    expect(state.history).toHaveLength(7);
    expect(formatExpression(state.cards[0].expression)).toBe('(((13 − 10) × ((6 + 4) + 5)) ^ ((3 + 1) − 2))');
    expect(new Set(state.cards[0].sourceIds).size).toBe(8);
  });

  it('rejects an early target and incomplete or duplicate provenance', () => {
    const state = createGame(fixture);
    state.cards[0].value = value(2025n);
    expect(hasWon(state)).toBe(false);
    state.cards = [state.cards[0]];
    expect(hasWon(state)).toBe(false);
    state.cards[0].sourceIds = state.initialHand.map(card => card.id);
    expect(hasWon(state)).toBe(true);
    state.cards[0].sourceIds[1] = state.cards[0].sourceIds[0];
    expect(hasWon(state)).toBe(false);
    state.cards[0].value = value(2024n);
    expect(hasWon(state)).toBe(false);
  });
});

it('formats normalized fractions, negatives, and optional face labels', () => {
  expect(formatValue(value(2n, -4n))).toBe('-1/2');
  expect(formatValue(value(13n))).toBe('13');
  expect(formatValue(value(13n), true)).toBe('K');
  expect(formatValue(value(11n), true)).toBe('J');
  expect(formatValue(value(12n), true)).toBe('Q');
  expect(formatValue(value(2n, 2n), true)).toBe('A');
  expect(formatValue(value(-1n), true)).toBe('-1');
});
