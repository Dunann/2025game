import type { ActiveRun, RunRecord, Settings, StoredData } from '../types';
import { parseGameConfig } from '../config';

export const STORAGE_KEY = '2025-game:v1';

export function defaultData(): StoredData {
  return { version: 1, settings: { playingCardMode: false }, runs: [], startedRuns: 0, activeRun: null };
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;

function validRecord(value: unknown): value is RunRecord {
  if (!object(value) || !validId(value.id) || !timestamp(value.startedAt) || !timestamp(value.endedAt) || value.endedAt < value.startedAt) return false;
  if ('config' in value && !parseGameConfig(value.config)) return false;
  if (!['won', 'given_up', 'abandoned'].includes(String(value.outcome))) return false;
  return timestamp(value.elapsedMs) || (value.outcome === 'abandoned' && value.elapsedMs === null);
}

export function parseStoredData(raw: unknown): StoredData | null {
    if (!object(raw) || raw.version !== 1) return null;
    const settingsConfig = object(raw.settings) && 'gameConfig' in raw.settings ? parseGameConfig(raw.settings.gameConfig) : undefined;
    if (settingsConfig === null) return null;
    const runs: RunRecord[] = [];
    const seen = new Set<string>();
    if (Array.isArray(raw.runs)) {
      for (const run of raw.runs) if (validRecord(run) && !seen.has(run.id)) {
        runs.push({ ...run, ...(run.config ? { config: parseGameConfig(run.config)! } : {}) }); seen.add(run.id);
      }
    }
    const active = raw.activeRun;
    const activeConfig = object(active) && 'config' in active ? parseGameConfig(active.config) : undefined;
    const activeRun = object(active) && validId(active.id) && timestamp(active.startedAt) && !seen.has(active.id) && activeConfig !== null
      ? { id: active.id, startedAt: active.startedAt, ...(activeConfig ? { config: activeConfig } : {}) } : null;
    return {
      version: 1,
      settings: { playingCardMode: object(raw.settings) && raw.settings.playingCardMode === true, ...(settingsConfig ? { gameConfig: settingsConfig } : {}) },
      runs,
      startedRuns: Math.max(Number.isSafeInteger(raw.startedRuns) && Number(raw.startedRuns) >= 0 ? Number(raw.startedRuns) : 0, runs.length + Number(activeRun !== null)),
      activeRun,
    };
}

export function loadData(): StoredData {
  try { return parseStoredData(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')) ?? defaultData(); }
  catch { return defaultData(); }
}

export function saveData(data: StoredData): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function finishRun(data: StoredData, record: RunRecord): StoredData {
  const activeRun = data.activeRun?.id === record.id ? null : data.activeRun;
  if (data.runs.some(run => run.id === record.id)) return activeRun === data.activeRun ? data : { ...data, activeRun };
  const config = 'config' in record ? parseGameConfig(record.config) : data.activeRun?.id === record.id ? data.activeRun.config : undefined;
  if (config === null) throw new Error('Invalid run configuration.');
  const snapshot = { ...record, ...(config ? { config: { ...config } } : {}) };
  return { ...data, runs: [...data.runs, snapshot], activeRun };
}

export function reconcileInterruptedRun(data: StoredData, now = Date.now()): StoredData {
  if (!data.activeRun) return data;
  return finishRun(data, { ...data.activeRun, outcome: 'abandoned', endedAt: Math.max(now, data.activeRun.startedAt), elapsedMs: null });
}

export function startRun(data: StoredData, run: ActiveRun): StoredData {
  if (data.activeRun?.id === run.id || data.runs.some(record => record.id === run.id)) return data;
  const config = 'config' in run ? parseGameConfig(run.config) : undefined;
  if (config === null) throw new Error('Invalid run configuration.');
  return { ...data, startedRuns: data.startedRuns + 1, activeRun: { ...run, ...(config ? { config } : {}) } };
}

export function updateSettings(data: StoredData, settings: Settings): StoredData {
  const config = 'gameConfig' in settings ? parseGameConfig(settings.gameConfig) : undefined;
  if (config === null) throw new Error('Invalid game settings.');
  return { ...data, settings: { playingCardMode: settings.playingCardMode, ...(config ? { gameConfig: config } : {}) } };
}
export function resetStats(data: StoredData): StoredData { return { ...defaultData(), settings: data.settings }; }
