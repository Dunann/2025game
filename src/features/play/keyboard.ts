import type { GameConfig, Operation } from '../../types';
import { isOperationAllowed } from '../../config';

export const OPERATION_CONTROLS = [
  { operation: 'add', key: 'a' },
  { operation: 'subtract', key: 's' },
  { operation: 'multiply', key: 'd' },
  { operation: 'divide', key: 'f' },
  { operation: 'power', key: 'g' },
] as const satisfies readonly { operation: Operation; key: string }[];

export function getOperationControls(config: GameConfig) {
  return OPERATION_CONTROLS.filter(control => isOperationAllowed(control.operation, config));
}

type KeyInput = Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>;

/** Map an eligible play key without changing selection or performing a merge. */
export function playKeyAction(event: KeyInput, context: { active: boolean; hasFirstCard: boolean; blocked: boolean; config: GameConfig }): Operation | 'clear' | null {
  if (!context.active || context.blocked || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented) return null;
  if (event.key === 'Escape') return 'clear';
  if (!context.hasFirstCard) return null;
  return getOperationControls(context.config).find(control => control.key === event.key.toLowerCase())?.operation ?? null;
}
