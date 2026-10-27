import { describe, expect, it } from 'vitest';
import { getOperationControls, playKeyAction } from './keyboard';
import { DEFAULT_GAME_CONFIG } from '../../config';

const eligible = { active: true, hasFirstCard: true, blocked: false, config: { ...DEFAULT_GAME_CONFIG, exponentiationEnabled: true } };
const keyInput = (key: string) => ({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false });

describe('operation keyboard selection', () => {
  it('removes powers from controls and ignores G when disabled', () => {
    const context = { ...eligible, config: { ...DEFAULT_GAME_CONFIG } };
    expect(getOperationControls(context.config).map(control => control.operation)).toEqual(['add', 'subtract', 'multiply', 'divide']);
    expect(playKeyAction(keyInput('g'), context)).toBeNull();
    expect(playKeyAction(keyInput('G'), context)).toBeNull();
    expect(playKeyAction(keyInput('a'), context)).toBe('add');
    expect(playKeyAction(keyInput('Escape'), context)).toBe('clear');
    expect(getOperationControls(eligible.config)).toHaveLength(5);
  });
  it.each([
    ['a', 'add'], ['s', 'subtract'], ['d', 'multiply'], ['f', 'divide'], ['g', 'power'],
    ['A', 'add'], ['S', 'subtract'], ['D', 'multiply'], ['F', 'divide'], ['G', 'power'],
  ])('selects %s as %s', (key, operation) => {
    expect(playKeyAction(keyInput(key), eligible)).toBe(operation);
  });

  it('requires a first card and active run for an operation', () => {
    expect(playKeyAction(keyInput('a'), { ...eligible, hasFirstCard: false })).toBeNull();
    expect(playKeyAction(keyInput('a'), { ...eligible, active: false })).toBeNull();
    expect(playKeyAction(keyInput('Escape'), { ...eligible, active: false })).toBeNull();
  });

  it('clears with Escape but ignores unrelated keys', () => {
    expect(playKeyAction(keyInput('Escape'), eligible)).toBe('clear');
    expect(playKeyAction(keyInput('Enter'), eligible)).toBeNull();
    expect(playKeyAction(keyInput('h'), eligible)).toBeNull();
  });

  it.each(['repeat', 'ctrlKey', 'metaKey', 'altKey', 'isComposing', 'defaultPrevented'] as const)(
    'ignores operations and Escape when %s is set', flag => {
      for (const key of ['a', 'Escape']) {
        expect(playKeyAction({ ...keyInput(key), [flag]: true }, eligible)).toBeNull();
      }
    },
  );

  it('preserves selection while editing or a dialog blocks the play screen', () => {
    for (const key of ['a', 'Escape']) {
      expect(playKeyAction(keyInput(key), { ...eligible, blocked: true })).toBeNull();
    }
  });
});
