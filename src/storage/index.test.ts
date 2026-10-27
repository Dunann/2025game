import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultData, finishRun, loadData, parseStoredData, reconcileInterruptedRun, resetStats, saveData, startRun, STORAGE_KEY, updateSettings } from './index';
import type { RunRecord } from '../types';
import { LEGACY_GAME_CONFIG } from '../config';

describe('local records', () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('survives missing, malformed and unsupported data', () => {
    expect(loadData()).toEqual(defaultData());
    for (const raw of ['{', '[]', 'null', '{"version":2}', '{"version":1,"runs":false}']) {
      stored.set(STORAGE_KEY, raw);
      expect(loadData()).toEqual(defaultData());
    }
  });
  it('validates individual records, deduplicates IDs and sanitizes settings', () => {
    const good: RunRecord = { id: 'a', outcome: 'won', startedAt: 1, endedAt: 2, elapsedMs: 1000 };
    stored.set(STORAGE_KEY, JSON.stringify({ version: 1, settings: { playingCardMode: 'yes' }, startedRuns: -2, activeRun: { id: 'a', startedAt: 1 }, runs: [good, good, { ...good, id: 'bad', elapsedMs: -2 }, { ...good, id: 'reverse', endedAt: 0 }, { ...good, id: 'nullwin', elapsedMs: null }, { ...good, id: 'unknown', outcome: 'other' }] }));
    expect(loadData()).toEqual({ ...defaultData(), runs: [{ ...good, config: LEGACY_GAME_CONFIG }], startedRuns: 1 });
  });
  it('round trips settings and records', () => {
    const data = updateSettings(defaultData(), { playingCardMode: true });
    expect(saveData(data)).toBe(true);
    expect(loadData()).toEqual(data);
  });
  it('preserves configuration through cache, finish, interruption and reset', () => {
    const config = { cardCount: 4, target: '0009007199254740993', exponentiationEnabled: false };
    const data = startRun(updateSettings(defaultData(), { playingCardMode: true, gameConfig: config }), { id: 'variation', startedAt: 1, config });
    config.target = '7';
    expect(saveData(data)).toBe(true);
    const restored = loadData();
    const canonical = { cardCount: 4, target: '9007199254740993', exponentiationEnabled: false };
    expect(restored.settings.gameConfig).toEqual(canonical);
    expect(restored.activeRun?.config).toEqual(canonical);
    expect(reconcileInterruptedRun(restored, 10).runs[0].config).toEqual(canonical);
    expect(finishRun(restored, { id: 'variation', startedAt: 1, endedAt: 10, elapsedMs: 9, outcome: 'won' }).runs[0].config).toEqual(canonical);
    expect(resetStats(restored).settings.gameConfig).toEqual(canonical);
  });
  it('drops explicitly malformed run configs without treating them as standard', () => {
    const legacy = { id: 'legacy', outcome: 'won', startedAt: 1, endedAt: 2, elapsedMs: 1 };
    const parsed = parseStoredData({ ...defaultData(), runs: [legacy, { ...legacy, id: 'bad', config: { cardCount: 1, target: '2025', exponentiationEnabled: false } }, { ...legacy, id: 'null', config: null }], activeRun: { id: 'active', startedAt: 1, config: { cardCount: 8, target: '1e3', exponentiationEnabled: false } } });
    expect(parsed?.runs).toEqual([{ ...legacy, config: LEGACY_GAME_CONFIG }]);
    expect(parsed?.activeRun).toBeNull();
    expect(parseStoredData({ ...defaultData(), settings: { playingCardMode: true, gameConfig: { cardCount: 8, target: '-1', exponentiationEnabled: false } } })).toBeNull();
  });
  it('normalizes historical two-field records and active runs with powers on, while old preferences default off', () => {
    const config = { cardCount: 4, target: '00024' };
    const loaded = parseStoredData({ ...defaultData(), settings: { playingCardMode: false, gameConfig: config }, activeRun: { id: 'active-old', startedAt: 2, config }, runs: [{ id: 'old', startedAt: 0, endedAt: 1, elapsedMs: 1, outcome: 'won', config }] })!;
    expect(loaded.settings.gameConfig).toEqual({ cardCount: 4, target: '24', exponentiationEnabled: false });
    expect(loaded.runs[0].config).toEqual({ cardCount: 4, target: '24', exponentiationEnabled: true });
    expect(reconcileInterruptedRun(loaded, 3).runs[1].config?.exponentiationEnabled).toBe(true);
  });
  it('handles blocked storage for reads and writes', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadData()).toEqual(defaultData());
    expect(saveData(defaultData())).toBe(false);
  });
  it('starts and finishes each run only once, keeping the first terminal outcome', () => {
    const active = { id: 'run', startedAt: 100 };
    const started = startRun(defaultData(), active);
    expect(startRun(started, active)).toBe(started);
    const record: RunRecord = { ...active, endedAt: 500, elapsedMs: 400, outcome: 'won' };
    const finished = finishRun(started, record);
    expect(finished.startedRuns).toBe(1);
    expect(finished.activeRun).toBeNull();
    expect(finishRun(finished, { ...record, outcome: 'given_up' })).toBe(finished);
    expect(startRun(finished, active)).toBe(finished);
  });
  it('reconciles a reload once without inventing duration', () => {
    const started = startRun(defaultData(), { id: 'interrupted', startedAt: 100 });
    const reconciled = reconcileInterruptedRun(started, 500);
    expect(reconciled.runs).toEqual([{ id: 'interrupted', startedAt: 100, endedAt: 500, elapsedMs: null, outcome: 'abandoned', config: LEGACY_GAME_CONFIG }]);
    expect(reconcileInterruptedRun(reconciled, 900)).toBe(reconciled);
    expect(reconcileInterruptedRun(started, 50).runs[0].endedAt).toBe(100);
  });
  it('does not clear another active attempt on a late repeated finish', () => {
    const data = startRun(defaultData(), { id: 'new', startedAt: 500 });
    const result = finishRun(data, { id: 'old', startedAt: 0, endedAt: 400, elapsedMs: 400, outcome: 'abandoned' });
    expect(result.activeRun?.id).toBe('new');
  });
  it('resets records while preserving preference', () => {
    const data = startRun(updateSettings(defaultData(), { playingCardMode: true }), { id: 'r', startedAt: 0 });
    expect(resetStats(data)).toEqual({ ...defaultData(), settings: { playingCardMode: true } });
  });
});
