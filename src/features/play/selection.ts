import type { Operation } from '../../types';

export interface PendingSelection { firstId: string | null; secondId: string | null; operation: Operation | null }
export const EMPTY_SELECTION: PendingSelection = { firstId: null, secondId: null, operation: null };
export type SelectionAction = { kind: 'card'; id: string } | { kind: 'operation'; operation: Operation } | { kind: 'clear' };
export interface MergeIntent { firstId: string; secondId: string; operation: Operation }

/** Selection remains intact after an intent; only a committed board change clears it. */
export function transitionSelection(current: PendingSelection, action: SelectionAction): { selection: PendingSelection; merge: MergeIntent | null } {
  if (action.kind === 'clear' || (action.kind === 'card' && action.id === current.firstId)) {
    return { selection: EMPTY_SELECTION, merge: null };
  }
  let selection: PendingSelection;
  if (action.kind === 'card') {
    if (!current.firstId) return { selection: { ...EMPTY_SELECTION, firstId: action.id }, merge: null };
    if (action.id === current.secondId) return { selection: { ...current, secondId: null }, merge: null };
    selection = { ...current, secondId: action.id };
  } else {
    if (!current.firstId) return { selection: current, merge: null };
    selection = { ...current, operation: action.operation };
  }
  const { firstId, secondId, operation } = selection;
  const merge = firstId && secondId && firstId !== secondId && operation ? { firstId, secondId, operation } : null;
  return { selection, merge };
}
