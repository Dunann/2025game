import type { GameConfig, Operation } from './types';

export const DEFAULT_GAME_CONFIG: Readonly<GameConfig> = { cardCount: 8, target: '2025', exponentiationEnabled: false };
export const LEGACY_GAME_CONFIG: Readonly<GameConfig> = { ...DEFAULT_GAME_CONFIG, exponentiationEnabled: true };
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

export function parseGameConfig(raw: unknown, legacyExponentiation = false): GameConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const config = raw as Record<string, unknown>;
  if (typeof config.cardCount !== 'number' || !Number.isInteger(config.cardCount) || config.cardCount < MIN_CARD_COUNT || config.cardCount > MAX_CARD_COUNT || typeof config.target !== 'string') return null;
  const target = normalizeTarget(config.target);
  if ('exponentiationEnabled' in config && typeof config.exponentiationEnabled !== 'boolean') return null;
  return target ? { cardCount: config.cardCount, target, exponentiationEnabled: typeof config.exponentiationEnabled === 'boolean' ? config.exponentiationEnabled : legacyExponentiation } : null;
}

/** New preferences and deals default to the four basic operations. */
export function getGameConfig(config?: unknown): GameConfig {
  return parseGameConfig(config) ?? { ...DEFAULT_GAME_CONFIG };
}

/** Historical records and queued run commands predate the optional power rule. */
export function parseRunConfig(config?: unknown): GameConfig | null {
  return config === undefined ? { ...LEGACY_GAME_CONFIG } : parseGameConfig(config, true);
}

export function getRunConfig(config?: unknown): GameConfig {
  return parseRunConfig(config) ?? { ...LEGACY_GAME_CONFIG };
}

export function isOperationAllowed(operation: Operation, config: GameConfig): boolean {
  return operation !== 'power' || config.exponentiationEnabled;
}

export function gameConfigKey(config: GameConfig): string {
  const normalized = getGameConfig(config);
  return `${normalized.cardCount}:${normalized.target}:power-${normalized.exponentiationEnabled ? 'on' : 'off'}`;
}

export function isStandardGame(config: GameConfig): boolean {
  return gameConfigKey(config) === gameConfigKey(DEFAULT_GAME_CONFIG);
}
