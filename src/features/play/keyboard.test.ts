import { describe, expect, it } from 'vitest';
import { playKeyAction } from './keyboard';

const eligible = { active: true, hasFirstCard: true, blocked: false };
const keyInput = (key: string) => ({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false });

describe('operation keyboard selection', () => {
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
