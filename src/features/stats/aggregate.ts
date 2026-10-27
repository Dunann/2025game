import type { GameConfig, RunRecord } from '../../types';
import { gameConfigKey, isStandardGame, parseRunConfig } from '../../config';

/** Configuration is part of a record's identity for comparisons and history. */
export function groupStatsRuns(runs: RunRecord[]): { standard: RunRecord[]; variations: { config: GameConfig; runs: RunRecord[] }[] } {
  const standard: RunRecord[] = [];
  const variations = new Map<string, { config: GameConfig; runs: RunRecord[] }>();
  for (const run of runs) {
    const config = parseRunConfig(run.config);
    if (!config) continue;
    if (isStandardGame(config)) { standard.push(run); continue; }
    const key = gameConfigKey(config);
    if (!variations.has(key)) variations.set(key, { config, runs: [] });
    variations.get(key)!.runs.push(run);
  }
  return { standard, variations: [...variations.values()].sort((a, b) => a.config.cardCount - b.config.cardCount || (BigInt(a.config.target) < BigInt(b.config.target) ? -1 : BigInt(a.config.target) > BigInt(b.config.target) ? 1 : 0) || Number(a.config.exponentiationEnabled) - Number(b.config.exponentiationEnabled)) };
}

function times(runs: RunRecord[], outcome: RunRecord['outcome']): number[] {
  return runs.filter(run => run.outcome === outcome && run.elapsedMs !== null).sort((a, b) => a.endedAt - b.endedAt).map(run => run.elapsedMs!);
}
function average(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

export function aggregateStats(runs: RunRecord[]) {
  const wins = times(runs, 'won');
  const giveUps = times(runs, 'given_up');
  const won = runs.filter(run => run.outcome === 'won').length;
  const givenUp = runs.filter(run => run.outcome === 'given_up').length;
  const abandoned = runs.filter(run => run.outcome === 'abandoned').length;
  const ended = won + givenUp + abandoned;
  return {
    won, givenUp, abandoned, ended,
    successRate: ended ? won / ended * 100 : null,
    bestWin: wins.length ? Math.min(...wins) : null,
    last20WinsAverage: average(wins.slice(-20)), last20WinsCount: Math.min(20, wins.length),
    giveUpAverage: average(giveUps),
    last20GiveUpsAverage: average(giveUps.slice(-20)), last20GiveUpsCount: Math.min(20, giveUps.length),
  };
}
