import type { RunRecord } from '../../types';

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
