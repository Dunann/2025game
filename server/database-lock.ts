import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

/** PGlite's Node filesystem must never be opened by two processes at once. */
export function lockDatabase(directory: string): () => void {
  const lockPath = `${directory}.lock`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor: number;
    try {
      descriptor = openSync(lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = Number(readFileSync(lockPath, 'utf8'));
      if (!Number.isSafeInteger(owner) || owner <= 0) {
        throw new Error(`Database lock at "${lockPath}" is incomplete. Check for another running backend before removing it.`);
      }
      try {
        process.kill(owner, 0);
      } catch (probeError) {
        if ((probeError as NodeJS.ErrnoException).code === 'ESRCH') {
          // Serialize stale-lock cleanup so two starters cannot remove a newly
          // acquired lock while both are recovering the same dead owner.
          const recoveryPath = `${lockPath}.recovery`;
          let recovery: number;
          try { recovery = openSync(recoveryPath, 'wx'); }
          catch {
            throw new Error(`Database lock recovery is already in progress at "${recoveryPath}". Check running backends before retrying.`);
          }
          try {
            try {
              if (readFileSync(lockPath, 'utf8') === String(owner)) unlinkSync(lockPath);
            } catch (removeError) {
              if ((removeError as NodeJS.ErrnoException).code !== 'ENOENT') throw removeError;
            }
          } finally {
            closeSync(recovery);
            unlinkSync(recoveryPath);
          }
          continue;
        }
        throw probeError;
      }
      throw new Error(`Local database is already open by process ${owner}. Stop that backend before starting another.`);
    }
    try { writeFileSync(descriptor, String(process.pid)); }
    finally { closeSync(descriptor); }
    let released = false;
    return () => {
      if (released) return;
      unlinkSync(lockPath);
      released = true;
    };
  }
  throw new Error(`Could not acquire database lock at "${lockPath}". Try starting the backend again.`);
}
