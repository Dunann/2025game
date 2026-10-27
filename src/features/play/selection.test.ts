import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, transitionSelection } from './selection';
import type { PendingSelection, SelectionAction } from './selection';
import type { Operation } from '../../types';

const card = (id: string): SelectionAction => ({ kind: 'card', id });
const op = (operation: Operation): SelectionAction => ({ kind: 'operation', operation });
function sequence(...actions: SelectionAction[]) {
  let result: ReturnType<typeof transitionSelection> = { selection: EMPTY_SELECTION, merge: null };
  for (const action of actions) result = transitionSelection(result.selection, action);
  return result;
}

describe('ordered card and operation selection', () => {
  it.each<Operation>(['add', 'subtract', 'multiply', 'divide', 'power'])('supports both input orders for %s', operation => {
    const expected = { firstId: 'left', secondId: 'right', operation };
    expect(sequence(card('left'), op(operation), card('right')).merge).toEqual(expected);
    expect(sequence(card('left'), card('right'), op(operation)).merge).toEqual(expected);
    expect(sequence(card('right'), card('left'), op(operation)).merge).toEqual({ ...expected, firstId: 'right', secondId: 'left' });
  });

  it('waits for all three choices', () => {
    expect(sequence(card('a')).merge).toBeNull();
    expect(sequence(card('a'), card('b')).merge).toBeNull();
    expect(sequence(card('a'), op('add')).merge).toBeNull();
    expect(sequence(op('add')).selection).toEqual(EMPTY_SELECTION);
  });

  it('clears the entire pending selection when first card is clicked again', () => {
    expect(sequence(card('a'), card('b'), op('divide'), card('a'))).toEqual({ selection: EMPTY_SELECTION, merge: null });
    expect(sequence(card('a'), op('power'), card('a')).merge).toBeNull();
  });

  it('deselects second card without clearing first card or operation', () => {
    expect(sequence(card('a'), card('b'), op('divide'), card('b'))).toEqual({
      selection: { firstId: 'a', secondId: null, operation: 'divide' }, merge: null,
    });
  });

  it('replaces the second card and retries when an operation is already chosen', () => {
    expect(sequence(card('a'), card('b'), card('c')).selection).toEqual({ firstId: 'a', secondId: 'c', operation: null });
    expect(sequence(card('a'), card('b'), op('divide'), card('c')).merge).toEqual({ firstId: 'a', secondId: 'c', operation: 'divide' });
  });

  it('retains a rejected pair for recovery with a different operation', () => {
    const rejected = sequence(card('numerator'), op('divide'), card('zero'));
    expect(rejected.selection).toEqual(rejected.merge);
    expect(transitionSelection(rejected.selection, op('multiply')).merge).toEqual({ firstId: 'numerator', secondId: 'zero', operation: 'multiply' });
  });

  it('clears selection after committed board changes or Escape', () => {
    const pending: PendingSelection = { firstId: 'a', secondId: 'b', operation: 'power' };
    expect(transitionSelection(pending, { kind: 'clear' })).toEqual({ selection: EMPTY_SELECTION, merge: null });
    expect(pending).toEqual({ firstId: 'a', secondId: 'b', operation: 'power' });
  });
});
