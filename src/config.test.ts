import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, gameConfigKey, getGameConfig, getRunConfig, isOperationAllowed, isStandardGame, normalizeTarget, parseGameConfig, parseRunConfig } from './config';

describe('game configurations', () => {
  it('defaults new games to four operations while preserving historical power rules', () => {
    expect(getGameConfig()).toEqual(DEFAULT_GAME_CONFIG);
    expect(isStandardGame(getGameConfig())).toBe(true);
    expect(isStandardGame({ cardCount: 6, target: '2025', exponentiationEnabled: false })).toBe(false);
    expect(getGameConfig().exponentiationEnabled).toBe(false);
    expect(getRunConfig().exponentiationEnabled).toBe(true);
    expect(getRunConfig({ cardCount: 4, target: '24' })).toEqual({ cardCount: 4, target: '24', exponentiationEnabled: true });
    expect(isStandardGame(getRunConfig())).toBe(false);
  });
  it('canonicalizes equivalent whole-number targets without losing precision', () => {
    expect(normalizeTarget(' 00024 ')).toBe('24');
    expect(gameConfigKey({ cardCount: 4, target: '00024', exponentiationEnabled: false })).toBe('4:24:power-off');
    expect(normalizeTarget('9007199254740993')).toBe('9007199254740993');
    expect(gameConfigKey({ cardCount: 8, target: '24', exponentiationEnabled: false })).not.toBe(gameConfigKey({ cardCount: 4, target: '24', exponentiationEnabled: false }));
    expect(gameConfigKey({ ...DEFAULT_GAME_CONFIG, exponentiationEnabled: true })).not.toBe(gameConfigKey(DEFAULT_GAME_CONFIG));
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
    expect(parseGameConfig({ cardCount: 2, target: '3' })).toEqual({ cardCount: 2, target: '3', exponentiationEnabled: false });
    expect(parseGameConfig({ cardCount: 52, target: '2025' })).toEqual({ cardCount: 52, target: '2025', exponentiationEnabled: false });
    for (const cardCount of [0, 1, 2.5, 53, NaN, Infinity, '8']) {
      expect(parseGameConfig({ cardCount, target: '2025' })).toBeNull();
    }
    expect(parseGameConfig({ cardCount: 8, target: 2025 })).toBeNull();
    expect(parseGameConfig(null)).toBeNull();
  });
  it('validates explicit operation policies and only defaults absent legacy flags', () => {
    for (const exponentiationEnabled of ['true', 0, null, undefined]) {
      const raw = { cardCount: 8, target: '2025', exponentiationEnabled };
      expect(parseGameConfig(raw)).toBeNull();
      expect(parseRunConfig(raw)).toBeNull();
    }
    expect(parseRunConfig({ cardCount: 2, target: '0003', exponentiationEnabled: false })).toEqual({ cardCount: 2, target: '3', exponentiationEnabled: false });
    expect(isOperationAllowed('power', DEFAULT_GAME_CONFIG)).toBe(false);
    expect(isOperationAllowed('power', getRunConfig())).toBe(true);
    for (const operation of ['add', 'subtract', 'multiply', 'divide'] as const) expect(isOperationAllowed(operation, DEFAULT_GAME_CONFIG)).toBe(true);
  });
});
