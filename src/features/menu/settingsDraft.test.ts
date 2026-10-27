import { describe, expect, it } from 'vitest';
import { validateGameSettings } from './settingsDraft';

describe('game settings input', () => {
  it('keeps targets exact and canonical without number conversion', () => {
    expect(validateGameSettings('52', '0009007199254740993').config).toEqual({ cardCount: 52, target: '9007199254740993', exponentiationEnabled: false });
    expect(validateGameSettings('2', '1').config).toEqual({ cardCount: 2, target: '1', exponentiationEnabled: false });
  });
  it('only opts into powers when explicitly selected for Apply', () => {
    expect(validateGameSettings('8', '2025', true).config?.exponentiationEnabled).toBe(true);
    expect(validateGameSettings('8', '2025', false).config?.exponentiationEnabled).toBe(false);
    expect(validateGameSettings('8', '2025').config?.exponentiationEnabled).toBe(false);
  });
  it.each(['1', '53', '2.5', '-2', '2e1', '', 'two'])('rejects card count %s', input => {
    expect(validateGameSettings(input, '2025').cardCountError).toBeTruthy();
    expect(validateGameSettings(input, '2025').config).toBeNull();
  });
  it.each(['0', '-1', '+1', '1.1', '1e5', '', '9'.repeat(1235)])('rejects invalid target', input => {
    expect(validateGameSettings('8', input).targetError).toBeTruthy();
    expect(validateGameSettings('8', input).config).toBeNull();
  });
  it('enforces the exact arithmetic target boundary', () => {
    expect(validateGameSettings('8', ((1n << 4096n) - 1n).toString()).config).not.toBeNull();
    expect(validateGameSettings('8', (1n << 4096n).toString()).config).toBeNull();
  });
});
