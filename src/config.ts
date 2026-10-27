import type { GameConfig } from './types';

export const DEFAULT_GAME_CONFIG: Readonly<GameConfig> = { cardCount: 8, target: '2025' };
export const MIN_CARD_COUNT = 2;
export const MAX_CARD_COUNT = 52;
export const MAX_TARGET_BITS = 4096;

export function normalizeTarget(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value) || value.length > 1234) return null;
  const target = BigInt(value);
  if (target <= 0n || target.toString(2).length > MAX_TARGET_BITS) return null;
  return target.toString();
}

export function parseGameConfig(raw: unknown): GameConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const config = raw as Record<string, unknown>;
  if (typeof config.cardCount !== 'number' || !Number.isInteger(config.cardCount) || config.cardCount < MIN_CARD_COUNT || config.cardCount > MAX_CARD_COUNT || typeof config.target !== 'string') return null;
  const target = normalizeTarget(config.target);
  return target ? { cardCount: config.cardCount, target } : null;
}

/** Missing legacy configuration always means the original eight-card 2025 game. */
export function getGameConfig(config?: GameConfig): GameConfig {
  return parseGameConfig(config) ?? { ...DEFAULT_GAME_CONFIG };
}

export function gameConfigKey(config: GameConfig): string {
  const normalized = getGameConfig(config);
  return `${normalized.cardCount}:${normalized.target}`;
}

export function isStandardGame(config: GameConfig): boolean {
  return gameConfigKey(config) === gameConfigKey(DEFAULT_GAME_CONFIG);
}
