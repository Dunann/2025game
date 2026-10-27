import { describe, expect, it } from 'vitest';
import type { RunRecord, RunOutcome } from '../../types';
import { aggregateStats } from './aggregate';

function records(count: number, outcome: RunOutcome): RunRecord[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${outcome}-${i}`, outcome, startedAt: 0, endedAt: i + 1, elapsedMs: (i + 1) * 1000 }));
}

describe('statistics', () => {
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
