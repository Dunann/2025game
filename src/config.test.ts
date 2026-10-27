import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, gameConfigKey, getGameConfig, isStandardGame, normalizeTarget, parseGameConfig } from './config';

describe('game configurations', () => {
  it('defaults legacy records to the standard eight-card 2025 game', () => {
    expect(getGameConfig()).toEqual(DEFAULT_GAME_CONFIG);
    expect(isStandardGame(getGameConfig())).toBe(true);
    expect(isStandardGame({ cardCount: 6, target: '2025' })).toBe(false);
  });
  it('canonicalizes equivalent whole-number targets without losing precision', () => {
    expect(normalizeTarget(' 00024 ')).toBe('24');
    expect(gameConfigKey({ cardCount: 4, target: '00024' })).toBe('4:24');
    expect(normalizeTarget('9007199254740993')).toBe('9007199254740993');
    expect(gameConfigKey({ cardCount: 8, target: '24' })).not.toBe(gameConfigKey({ cardCount: 4, target: '24' }));
  });
  it.each(['', '0', '-1', '+1', '1.5', '1e3', 'NaN', 'Infinity', '12 34'])('rejects invalid target %s', target => {
    expect(normalizeTarget(target)).toBeNull();
  });
  it('respects the exact arithmetic limit before accepting a target', () => {
    expect(normalizeTarget(((1n << 4096n) - 1n).toString())).not.toBeNull();
    expect(normalizeTarget((1n << 4096n).toString())).toBeNull();
    expect(normalizeTarget('9'.repeat(1235))).toBeNull();
  });
  it('accepts physical deck limits and rejects invalid explicit configurations', () => {
    expect(parseGameConfig({ cardCount: 2, target: '3' })).toEqual({ cardCount: 2, target: '3' });
    expect(parseGameConfig({ cardCount: 52, target: '2025' })).toEqual({ cardCount: 52, target: '2025' });
    for (const cardCount of [0, 1, 2.5, 53, NaN, Infinity, '8']) {
      expect(parseGameConfig({ cardCount, target: '2025' })).toBeNull();
    }
    expect(parseGameConfig({ cardCount: 8, target: 2025 })).toBeNull();
    expect(parseGameConfig(null)).toBeNull();
  });
});
