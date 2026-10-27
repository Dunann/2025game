import type { GameConfig } from '../../types';
import { normalizeTarget } from '../../config';

export function validateGameSettings(cardCount: string, target: string): { config: GameConfig | null; cardCountError: string | null; targetError: string | null } {
  const count = /^\d{1,2}$/.test(cardCount.trim()) ? Number(cardCount.trim()) : NaN;
  const cardCountError = !Number.isInteger(count) || count < 2 || count > 52 ? 'Choose 2–52 cards.' : null;
  const normalizedTarget = normalizeTarget(target);
  const targetError = normalizedTarget === null ? (/^\d+$/.test(target.trim()) && /[1-9]/.test(target) ? 'That target is too large.' : 'Enter a positive whole number.') : null;
  return { config: !cardCountError && normalizedTarget !== null ? { cardCount: count, target: normalizedTarget } : null, cardCountError, targetError };
}
