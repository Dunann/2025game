import type { Operation } from '../../types';

export const OPERATION_CONTROLS = [
  { operation: 'add', key: 'a' },
  { operation: 'subtract', key: 's' },
  { operation: 'multiply', key: 'd' },
  { operation: 'divide', key: 'f' },
  { operation: 'power', key: 'g' },
] as const satisfies readonly { operation: Operation; key: string }[];

type KeyInput = Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>;

/** Map an eligible play key without changing selection or performing a merge. */
export function playKeyAction(event: KeyInput, context: { active: boolean; hasFirstCard: boolean; blocked: boolean }): Operation | 'clear' | null {
  if (!context.active || context.blocked || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented) return null;
  if (event.key === 'Escape') return 'clear';
  if (!context.hasFirstCard) return null;
  return OPERATION_CONTROLS.find(control => control.key === event.key.toLowerCase())?.operation ?? null;
}
