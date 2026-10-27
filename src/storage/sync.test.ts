import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishRemoteRun, resetRemoteStats, saveRemoteSettings, startRemoteRun } from './api';
import { createSaveQueue, OUTBOX_KEY } from './sync';

vi.mock('./api', () => ({ saveRemoteSettings: vi.fn(), startRemoteRun: vi.fn(), finishRemoteRun: vi.fn(), resetRemoteStats: vi.fn() }));

describe('ordered save outbox', () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    vi.resetAllMocks();
    stored = new Map();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists immediately and sends commands sequentially, removing only acknowledged commands', async () => {
    let acknowledge!: () => void;
    vi.mocked(startRemoteRun).mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
    const status = vi.fn();
    const queue = createSaveQueue(status);
    const run = { id: 'run', startedAt: 1 };
    queue.enqueue({ kind: 'start', run });
    queue.enqueue({ kind: 'finish', record: { ...run, outcome: 'won', endedAt: 10, elapsedMs: 9 } });
    expect(JSON.parse(stored.get(OUTBOX_KEY)!).commands).toHaveLength(2);
    expect(finishRemoteRun).not.toHaveBeenCalled();
    acknowledge();
    expect(await queue.flush()).toBe(true);
    expect(startRemoteRun).toHaveBeenCalledTimes(1);
    expect(finishRemoteRun).toHaveBeenCalledTimes(1);
    expect(stored.has(OUTBOX_KEY)).toBe(false);
    expect(status).toHaveBeenLastCalledWith({ pending: 0, error: null });
  });

  it('retains a failed head and later commands until explicit retry, stopping again on failure', async () => {
    vi.mocked(startRemoteRun).mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(new Error('Still offline')).mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createSaveQueue(status);
    queue.enqueue({ kind: 'start', run: { id: 'r', startedAt: 1 } });
    expect(await queue.flush()).toBe(false);
    queue.enqueue({ kind: 'reset' });
    expect(await queue.flush()).toBe(false);
    expect(startRemoteRun).toHaveBeenCalledTimes(1);
    expect(resetRemoteStats).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith({ pending: 2, error: 'Offline' });
    queue.retry();
    expect(await queue.flush()).toBe(false);
    expect(resetRemoteStats).not.toHaveBeenCalled();
    queue.retry();
    expect(await queue.flush()).toBe(true);
    expect(startRemoteRun).toHaveBeenCalledTimes(3);
    expect(resetRemoteStats).toHaveBeenCalledTimes(1);
  });

  it('replays a restored outbox before profile loading without requiring another enqueue', async () => {
    stored.set(OUTBOX_KEY, JSON.stringify({ version: 1, commands: [{ kind: 'settings', settings: { playingCardMode: true } }, { kind: 'reset' }] }));
    const queue = createSaveQueue(vi.fn());
    expect(saveRemoteSettings).not.toHaveBeenCalled();
    expect(await queue.flush()).toBe(true);
    expect(saveRemoteSettings).toHaveBeenCalledWith({ playingCardMode: true });
    expect(resetRemoteStats).toHaveBeenCalledTimes(1);
  });
  it('restores and canonicalizes settings and run configurations without losing legacy saves', async () => {
    const config = { cardCount: 52, target: '009007199254740993' };
    const canonical = { cardCount: 52, target: '9007199254740993' };
    const run = { id: 'variation', startedAt: 1, config };
    const record = { ...run, outcome: 'won', endedAt: 10, elapsedMs: 9 };
    stored.set(OUTBOX_KEY, JSON.stringify({ version: 1, commands: [
      { kind: 'settings', settings: { playingCardMode: true, gameConfig: config } },
      { kind: 'start', run }, { kind: 'finish', record },
      { kind: 'start', run: { id: 'legacy', startedAt: 2 } },
    ] }));
    expect(await createSaveQueue(vi.fn()).flush()).toBe(true);
    expect(saveRemoteSettings).toHaveBeenCalledWith({ playingCardMode: true, gameConfig: canonical });
    expect(startRemoteRun).toHaveBeenNthCalledWith(1, { ...run, config: canonical });
    expect(startRemoteRun).toHaveBeenNthCalledWith(2, { id: 'legacy', startedAt: 2 });
    expect(finishRemoteRun).toHaveBeenCalledWith({ ...record, config: canonical });
  });
  it('snapshots nested configuration before callers can mutate an unsent command', async () => {
    vi.mocked(startRemoteRun).mockRejectedValue(new Error('Offline'));
    const queue = createSaveQueue(vi.fn());
    const config = { cardCount: 4, target: '24' };
    queue.enqueue({ kind: 'start', run: { id: 'r', startedAt: 1, config } });
    expect(await queue.flush()).toBe(false);
    queue.enqueue({ kind: 'settings', settings: { playingCardMode: true, gameConfig: config } });
    queue.enqueue({ kind: 'finish', record: { id: 'r', startedAt: 1, endedAt: 2, elapsedMs: 1, outcome: 'won', config } });
    config.cardCount = 8; config.target = '2025';
    const commands = JSON.parse(stored.get(OUTBOX_KEY)!).commands;
    expect(commands[0].run.config).toEqual({ cardCount: 4, target: '24' });
    expect(commands[1].settings.gameConfig).toEqual({ cardCount: 4, target: '24' });
    expect(commands[2].record.config).toEqual({ cardCount: 4, target: '24' });
  });
  it('drops malformed explicit configuration rather than replaying it as a standard attempt', async () => {
    const config = { cardCount: 8, target: '1e3' };
    stored.set(OUTBOX_KEY, JSON.stringify({ version: 1, commands: [
      { kind: 'settings', settings: { playingCardMode: true, gameConfig: config } },
      { kind: 'start', run: { id: 'bad', startedAt: 1, config } },
      { kind: 'finish', record: { id: 'bad', startedAt: 1, endedAt: 2, elapsedMs: 1, outcome: 'won', config } },
      { kind: 'reset' },
    ] }));
    expect(await createSaveQueue(vi.fn()).flush()).toBe(true);
    expect(saveRemoteSettings).not.toHaveBeenCalled();
    expect(startRemoteRun).not.toHaveBeenCalled();
    expect(finishRemoteRun).not.toHaveBeenCalled();
    expect(resetRemoteStats).toHaveBeenCalledOnce();
  });

  it('rejects corrupt recovered payloads while keeping valid commands', async () => {
    stored.set(OUTBOX_KEY, JSON.stringify({ version: 1, commands: [null, { kind: 'settings', settings: { playingCardMode: 'yes' } }, { kind: 'finish', record: { id: 'bad' } }, { kind: 'start', run: { id: 'negative', startedAt: -1 } }, { kind: 'reset' }] }));
    expect(await createSaveQueue(vi.fn()).flush()).toBe(true);
    expect(resetRemoteStats).toHaveBeenCalledTimes(1);
    expect(saveRemoteSettings).not.toHaveBeenCalled();
    stored.set(OUTBOX_KEY, '{');
    expect(await createSaveQueue(vi.fn()).flush()).toBe(true);
  });

  it('works in memory when session storage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    const queue = createSaveQueue(vi.fn());
    queue.enqueue({ kind: 'settings', settings: { playingCardMode: false } });
    expect(await queue.flush()).toBe(true);
  });

  it('accepts a new command immediately after an empty flush and snapshots its payload', async () => {
    const queue = createSaveQueue(vi.fn());
    const empty = queue.flush();
    const settings = { playingCardMode: true };
    queue.enqueue({ kind: 'settings', settings });
    settings.playingCardMode = false;
    expect(await empty).toBe(true);
    expect(await queue.flush()).toBe(true);
    expect(saveRemoteSettings).toHaveBeenCalledWith({ playingCardMode: true });
  });

  it('disposal suppresses callback updates while allowing an in-flight save to finish', async () => {
    let acknowledge!: () => void;
    vi.mocked(resetRemoteStats).mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
    const status = vi.fn();
    const queue = createSaveQueue(status);
    queue.enqueue({ kind: 'reset' });
    queue.dispose();
    status.mockClear();
    acknowledge();
    expect(await queue.flush()).toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(stored.has(OUTBOX_KEY)).toBe(false);
  });
});
