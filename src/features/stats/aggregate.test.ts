import { describe, expect, it } from 'vitest';
import type { RunRecord, RunOutcome } from '../../types';
import { aggregateStats, groupStatsRuns } from './aggregate';

function records(count: number, outcome: RunOutcome): RunRecord[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${outcome}-${i}`, outcome, startedAt: 0, endedAt: i + 1, elapsedMs: (i + 1) * 1000 }));
}

describe('statistics', () => {
  it('separates legacy power-enabled records from the new standard and exact variations', () => {
    const base = { id: 'legacy', startedAt: 0, endedAt: 10, elapsedMs: 9000, outcome: 'won' as const };
    const grouped = groupStatsRuns([
      base, { ...base, id: 'explicit', config: { cardCount: 8, target: '02025', exponentiationEnabled: false } },
      { ...base, id: 'v1', elapsedMs: 100, config: { cardCount: 4, target: '0024', exponentiationEnabled: false } },
      { ...base, id: 'v2', outcome: 'given_up', elapsedMs: 200, config: { cardCount: 4, target: '24', exponentiationEnabled: false } },
      { ...base, id: 'v3', elapsedMs: 300, config: { cardCount: 5, target: '24', exponentiationEnabled: false } },
      { ...base, id: 'v4', elapsedMs: 400, config: { cardCount: 4, target: '25', exponentiationEnabled: false } },
      { ...base, id: 'bad', config: { cardCount: 0, target: '2025', exponentiationEnabled: false } },
    ]);
    expect(grouped.standard.map(run => run.id)).toEqual(['explicit']);
    expect(grouped.variations.map(group => [group.config.cardCount, group.config.target, group.runs.map(run => run.id)])).toEqual([[4, '24', ['v1', 'v2']], [4, '25', ['v4']], [5, '24', ['v3']], [8, '2025', ['legacy']]]);
    const stats = aggregateStats(grouped.variations[0].runs);
    expect(stats.bestWin).toBe(100);
    expect(stats.giveUpAverage).toBe(200);
    expect(stats.successRate).toBe(50);
    expect(aggregateStats(grouped.standard).bestWin).toBe(9000);
  });
  for (const count of [0, 1, 19, 20, 21]) {
    it(`calculates winning and give-up averages for ${count} attempts independently`, () => {
      const wins = records(count, 'won');
      const giveUps = records(count, 'given_up');
      const stats = aggregateStats([...wins, ...giveUps, ...records(2, 'abandoned')].reverse());
      const expected = count ? ((Math.max(1, count - 19) + count) / 2) * 1000 : null;
      expect(stats.bestWin).toBe(count ? 1000 : null);
      expect(stats.last20WinsAverage).toBe(expected);
      expect(stats.last20GiveUpsAverage).toBe(expected);
      expect(stats.last20WinsCount).toBe(Math.min(20, count));
      expect(stats.last20GiveUpsCount).toBe(Math.min(20, count));
      expect(stats.giveUpAverage).toBe(count ? ((count + 1) / 2) * 1000 : null);
      expect(stats.won).toBe(count);
      expect(stats.givenUp).toBe(count);
      expect(stats.abandoned).toBe(2);
      expect(stats.successRate).toBe(count / (count * 2 + 2) * 100);
    });
  }
  it('uses ended attempts for success rate including unknown-duration abandonment', () => {
    expect(aggregateStats([]).successRate).toBeNull();
    expect(aggregateStats(records(2, 'won')).successRate).toBe(100);
    expect(aggregateStats(records(2, 'given_up')).successRate).toBe(0);
    const stats = aggregateStats([...records(1, 'won'), ...records(1, 'given_up'), { id: 'interrupted', outcome: 'abandoned', startedAt: 0, endedAt: 5, elapsedMs: null }]);
    expect(stats.successRate).toBeCloseTo(100 / 3);
    expect(stats.giveUpAverage).toBe(1000);
    expect(stats.last20WinsAverage).toBe(1000);
  });
});
