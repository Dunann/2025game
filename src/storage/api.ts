import type { ActiveRun, GameConfig, RunRecord, Settings, StoredData } from '../types';
import { parseStoredData } from './index';

export const REQUEST_TIMEOUT_MS = 10_000;
/** Older queued settings cannot express the power preference; omission preserves it. */
export type SettingsWrite = Omit<Settings, 'gameConfig'> & { gameConfig?: Omit<GameConfig, 'exponentiationEnabled'> & { exponentiationEnabled?: boolean } };

export class ApiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

async function request(path: string, method: string, body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new ApiError(response.ok ? 'The server returned an unreadable response.' : `The server could not complete the request (${response.status}).`, response.status); }
    if (!response.ok) {
      throw new ApiError(isObject(payload) && typeof payload.error === 'string' && payload.error.trim() ? payload.error : `The server could not complete the request (${response.status}).`, response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('The server took too long to respond. Please try again.');
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

async function mutate(path: string, method: string, body?: unknown): Promise<void> {
  const response = await request(path, method, body);
  if (!isObject(response) || response.ok !== true) throw new ApiError('The server did not confirm that your changes were saved.');
}

export async function loadProfile(): Promise<StoredData> {
  const profile = parseStoredData(await request('/api/profile', 'GET'));
  if (!profile) throw new ApiError('The server returned an unsupported profile. Please try again.');
  return profile;
}
export function saveRemoteSettings(settings: SettingsWrite): Promise<void> { return mutate('/api/settings', 'PUT', settings); }
export function startRemoteRun(run: ActiveRun): Promise<void> { return mutate('/api/runs/start', 'POST', run); }
export function finishRemoteRun(record: RunRecord): Promise<void> { return mutate('/api/runs/finish', 'POST', record); }
export function resetRemoteStats(): Promise<void> { return mutate('/api/stats', 'DELETE'); }
