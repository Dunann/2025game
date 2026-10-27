import type { ActiveRun, RunRecord } from '../types';
import { parseGameConfig, parseRunConfig } from '../config';
import { finishRemoteRun, resetRemoteStats, saveRemoteSettings, startRemoteRun } from './api';
import type { SettingsWrite } from './api';

export type SaveCommand = { kind: 'settings'; settings: SettingsWrite } | { kind: 'start'; run: ActiveRun } | { kind: 'finish'; record: RunRecord } | { kind: 'reset' };
export type SaveStatus = { pending: number; error: string | null };
export const OUTBOX_KEY = '2025-game:outbox:v1';

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);

function parseCommand(raw: unknown): SaveCommand | null {
  if (!object(raw)) return null;
  if (raw.kind === 'reset') return { kind: 'reset' };
  if (raw.kind === 'settings' && object(raw.settings) && typeof raw.settings.playingCardMode === 'boolean') {
    const config = 'gameConfig' in raw.settings ? parseGameConfig(raw.settings.gameConfig) : undefined;
    if (config === null) return null;
    const gameConfig = config && object(raw.settings.gameConfig) && !('exponentiationEnabled' in raw.settings.gameConfig)
      ? { cardCount: config.cardCount, target: config.target } : config;
    return { kind: 'settings', settings: { playingCardMode: raw.settings.playingCardMode, ...(gameConfig ? { gameConfig } : {}) } };
  }
  if (raw.kind === 'start' && object(raw.run) && id(raw.run.id) && time(raw.run.startedAt)) {
    const config = parseRunConfig(raw.run.config);
    if (config === null) return null;
    return { kind: 'start', run: { id: raw.run.id, startedAt: raw.run.startedAt, ...(config ? { config } : {}) } };
  }
  if (raw.kind === 'finish' && object(raw.record)) {
    const run = raw.record;
    if (!id(run.id) || !time(run.startedAt) || !time(run.endedAt) || run.endedAt < run.startedAt) return null;
    if (run.outcome !== 'won' && run.outcome !== 'given_up' && run.outcome !== 'abandoned') return null;
    if (!time(run.elapsedMs) && !(run.outcome === 'abandoned' && run.elapsedMs === null)) return null;
    if (typeof run.elapsedMs === 'number' && run.elapsedMs > 365 * 24 * 60 * 60 * 1000) return null;
    const config = parseRunConfig(run.config);
    if (config === null) return null;
    return { kind: 'finish', record: { id: run.id, startedAt: run.startedAt, endedAt: run.endedAt, outcome: run.outcome, elapsedMs: run.elapsedMs as number | null, ...(config ? { config } : {}) } };
  }
  return null;
}

function restore(): SaveCommand[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(OUTBOX_KEY) ?? 'null');
    if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.commands)) return [];
    return raw.commands.map(parseCommand).filter((command): command is SaveCommand => command !== null);
  } catch { return []; }
}

async function execute(command: SaveCommand): Promise<void> {
  switch (command.kind) {
    case 'settings': return saveRemoteSettings(command.settings);
    case 'start': return startRemoteRun(command.run);
    case 'finish': return finishRemoteRun(command.record);
    case 'reset': return resetRemoteStats();
  }
}

/** Use one queue per tab. The outbox is replayed by flush before loading the server profile. */
export function createSaveQueue(onStatus: (status: SaveStatus) => void) {
  const commands = restore();
  let listener: typeof onStatus | null = onStatus;
  let error: string | null = null;
  let running: Promise<boolean> | null = null;
  const report = () => { listener?.({ pending: commands.length, error }); };
  const persist = () => {
    try {
      if (commands.length) sessionStorage.setItem(OUTBOX_KEY, JSON.stringify({ version: 1, commands }));
      else sessionStorage.removeItem(OUTBOX_KEY);
    } catch { /* Saving remains available in memory when browser storage is blocked. */ }
  };
  persist();
  report();

  const drain = (): Promise<boolean> => {
    if (running) return running;
    if (error) return Promise.resolve(false);
    if (!commands.length) return Promise.resolve(true);
    running = (async () => {
      while (commands.length) {
        try { await execute(commands[0]); }
        catch (failure) {
          error = failure instanceof Error ? failure.message : 'Your changes could not be saved. Please retry.';
          report();
          return false;
        }
        commands.shift();
        persist();
        report();
      }
      return true;
    })().finally(() => { running = null; });
    return running;
  };
  return {
    enqueue(command: SaveCommand) {
      // Copy payloads so later caller changes cannot alter an unsent operation.
      const snapshot = parseCommand(command);
      if (!snapshot) throw new Error('Cannot queue an invalid save command.');
      commands.push(snapshot);
      persist();
      report();
      void drain();
    },
    retry() { error = null; report(); void drain(); },
    flush: drain,
    dispose() { listener = null; },
  };
}
