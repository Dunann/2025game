import { describe, expect, it } from 'vitest';
import type { GameConfig, SourceCard } from '../types';
import { createGame, drawHand, hasWon, mergeCards, undoMerge } from './index';

const pair: SourceCard[] = [2, 3].map(rank => ({ id: `source-${rank}`, rank, suit: 'hearts' }));

describe('configured games', () => {
  it('preserves the standard defaults and draws the configured number when omitted', () => {
    expect(createGame().config).toEqual({ cardCount: 8, target: '2025', exponentiationEnabled: false });
    expect(createGame(undefined, { cardCount: 2, target: '5', exponentiationEnabled: false }).cards).toHaveLength(2);
    expect(createGame(undefined, { cardCount: 52, target: '2025', exponentiationEnabled: false }).cards).toHaveLength(52);
  });

  it('draws every physical card exactly once at the maximum count', () => {
    const hand = drawHand(() => 0.5, 52);
    expect(hand).toHaveLength(52);
    expect(new Set(hand.map(card => card.id)).size).toBe(52);
    expect(new Set(hand.map(card => `${card.suit}:${card.rank}`)).size).toBe(52);
  });

  it.each([0, 1, 53, -2, 2.5, NaN])('rejects invalid draw count %s', count => {
    expect(() => drawHand(undefined, count)).toThrow();
  });

  it('wins a two-card custom target and preserves configuration through undo', () => {
    const game = createGame(pair, { cardCount: 2, target: '0005', exponentiationEnabled: false });
    expect(game.config).toEqual({ cardCount: 2, target: '5', exponentiationEnabled: false });
    expect(hasWon(game)).toBe(false);
    const merged = mergeCards(game, game.cards[0].id, 'add', game.cards[1].id);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(hasWon(merged.state)).toBe(true);
    expect(undoMerge(merged.state).config).toEqual(game.config);
    expect(hasWon(undoMerge(merged.state))).toBe(false);
    merged.state.cards[0].sourceIds.pop();
    expect(hasWon(merged.state)).toBe(false);
  });

  it('snapshots normalized configuration and copies the supplied hand', () => {
    const config = { cardCount: 2, target: '005', exponentiationEnabled: false };
    const hand = pair.map(card => ({ ...card }));
    const game = createGame(hand, config);
    config.cardCount = 8;
    config.target = '2025';
    config.exponentiationEnabled = true;
    hand[0].rank = 13;
    expect(game.config).toEqual({ cardCount: 2, target: '5', exponentiationEnabled: false });
    expect(game.initialHand[0].rank).toBe(2);
  });

  it.each([
    { cardCount: 1, target: '5' }, { cardCount: 53, target: '5' },
    { cardCount: 2, target: '0' }, { cardCount: 2, target: '-5' },
    { cardCount: 2, target: '2.5' }, { cardCount: 2, target: '1e3' },
    { cardCount: 2, target: '9'.repeat(1234) },
  ])('rejects explicit invalid configuration instead of defaulting', config => {
    expect(() => createGame(undefined, { ...config, exponentiationEnabled: false })).toThrow();
  });

  it('requires hand count and physical identities to match the configuration', () => {
    expect(() => createGame(pair)).toThrow();
    expect(() => createGame([pair[0], pair[0]], { cardCount: 2, target: '4', exponentiationEnabled: false })).toThrow();
  });

  it('compares a huge target exactly without Number coercion', () => {
    const target = (2n ** 4095n + 1n).toString();
    const config: GameConfig = { cardCount: 2, target, exponentiationEnabled: false };
    const game = createGame(pair, config);
    const result = mergeCards(game, game.cards[0].id, 'add', game.cards[1].id);
    if (!result.ok) throw new Error(result.error);
    result.state.cards[0].value = { numerator: BigInt(target), denominator: 1n };
    expect(hasWon(result.state)).toBe(true);
    result.state.cards[0].value.numerator -= 1n;
    expect(hasWon(result.state)).toBe(false);
  });

  it('blocks a power operation without changing the board, history, or revision', () => {
    const game = createGame(pair, { cardCount: 2, target: '8', exponentiationEnabled: false });
    const cards = game.cards;
    const history = game.history;
    const before = structuredClone(game);
    const result = mergeCards(game, game.cards[0].id, 'power', game.cards[1].id);
    expect(result).toEqual({ ok: false, error: 'Exponentiation is disabled for this game.' });
    expect(game).toEqual(before);
    expect(game.cards).toBe(cards);
    expect(game.history).toBe(history);
    expect(game.revision).toBe(0);
  });

  it('permits a power win only for a game that opted in and retains the rule through undo', () => {
    const game = createGame(pair, { cardCount: 2, target: '8', exponentiationEnabled: true });
    const result = mergeCards(game, game.cards[0].id, 'power', game.cards[1].id);
    if (!result.ok) throw new Error(result.error);
    expect(hasWon(result.state)).toBe(true);
    expect(result.state.config.exponentiationEnabled).toBe(true);
    const restored = undoMerge(result.state);
    expect(restored.cards).toEqual(game.cards);
    expect(restored.config.exponentiationEnabled).toBe(true);
  });

  it.each(['add', 'subtract', 'multiply', 'divide'] as const)('keeps %s available with powers disabled', operation => {
    const game = createGame(pair, { cardCount: 2, target: '8', exponentiationEnabled: false });
    const result = mergeCards(game, game.cards[0].id, operation, game.cards[1].id);
    expect(result.ok).toBe(true);
  });
});
