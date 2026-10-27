import { loadProfile } from './storage/api';
import { reconcileInterruptedRun } from './storage';
import { createSaveQueue } from './storage/sync';
import { acquirePlayerTabLock } from './sessionLock';
import type { SaveStatus } from './storage/sync';
import type { StoredData } from './types';

let status: SaveStatus = { pending: 0, error: null };
const listeners = new Set<(status: SaveStatus) => void>();
// A single queue survives React StrictMode's effect replay and component rerenders.
export const saves = createSaveQueue((next) => {
  status = next;
  for (const listener of listeners) listener(next);
});
export function subscribeToSaves(listener: (status: SaveStatus) => void) {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

let startup: Promise<StoredData> | null = null;
export function bootstrapProfile(): Promise<StoredData> {
  if (!startup) startup = (async () => {
    await acquirePlayerTabLock();
    saves.retry();
    if (!await saves.flush()) throw new Error('Pending records could not be saved. Check the server connection and retry.');
    const profile = await loadProfile();
    const reconciled = reconcileInterruptedRun(profile);
    if (profile.activeRun) {
      const record = reconciled.runs.find(run => run.id === profile.activeRun!.id);
      if (record) saves.enqueue({ kind: 'finish', record });
      if (!await saves.flush()) throw new Error('The previous attempt could not be finalized. Please retry.');
    }
    return reconciled;
  })().catch((error: unknown) => { startup = null; throw error; });
  return startup;
}
