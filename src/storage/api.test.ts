import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, finishRemoteRun, loadProfile, REQUEST_TIMEOUT_MS, resetRemoteStats, saveRemoteSettings, startRemoteRun } from './api';
import { defaultData } from './index';

describe('profile API client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const respond = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('loads a profile using same-origin credentials without exposing an identity', async () => {
    fetchMock.mockResolvedValue(respond(defaultData()));
    expect(await loadProfile()).toEqual(defaultData());
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: expect.any(AbortSignal) }));
  });
  it('preserves configuration on profile loading and all write payloads', async () => {
    const config = { cardCount: 4, target: '9007199254740993', exponentiationEnabled: false };
    const settings = { playingCardMode: true, gameConfig: config };
    const active = { id: 'variation', startedAt: 1, config };
    const record = { ...active, endedAt: 2, elapsedMs: 1, outcome: 'won' as const };
    fetchMock.mockResolvedValueOnce(respond({ ...defaultData(), settings, activeRun: active, runs: [record] }));
    const loaded = await loadProfile();
    expect(loaded.settings).toEqual(settings);
    expect(loaded.runs[0]).toEqual(record);
    fetchMock.mockImplementation(async () => respond({ ok: true }));
    await saveRemoteSettings(settings); await startRemoteRun(active); await finishRemoteRun(record);
    expect(fetchMock.mock.calls.slice(1).map(([, options]) => JSON.parse(String(options?.body)))).toEqual([settings, active, record]);
  });
  it('sanitizes malformed profile records before returning data to views', async () => {
    fetchMock.mockResolvedValue(respond({ ...defaultData(), runs: [null, { id: 'bad', outcome: 'won' }], settings: { playingCardMode: 'false' } }));
    expect(await loadProfile()).toEqual(defaultData());
  });
  it('rejects unsupported profile schemas', async () => {
    fetchMock.mockResolvedValue(respond({ version: 4 }));
    await expect(loadProfile()).rejects.toThrow('unsupported profile');
  });
  it('sends settings and run mutations with the agreed methods and JSON bodies', async () => {
    fetchMock.mockImplementation(async () => respond({ ok: true }));
    const settings = { playingCardMode: true };
    const active = { id: 'run', startedAt: 100 };
    const record = { ...active, outcome: 'won' as const, endedAt: 200, elapsedMs: 100 };
    await saveRemoteSettings(settings);
    await startRemoteRun(active);
    await finishRemoteRun(record);
    await resetRemoteStats();
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method, options?.body])).toEqual([
      ['/api/settings', 'PUT', JSON.stringify(settings)], ['/api/runs/start', 'POST', JSON.stringify(active)], ['/api/runs/finish', 'POST', JSON.stringify(record)], ['/api/stats', 'DELETE', undefined],
    ]);
  });
  it('requires mutation acknowledgement', async () => {
    fetchMock.mockResolvedValue(respond({}));
    await expect(resetRemoteStats()).rejects.toThrow('did not confirm');
  });
  it('preserves server error text and HTTP status', async () => {
    fetchMock.mockResolvedValue(respond({ error: 'That run was already finished.' }, 409));
    try { await resetRemoteStats(); expect.fail('Expected failure'); }
    catch (error) { expect(error).toBeInstanceOf(ApiError); expect(error).toMatchObject({ message: 'That run was already finished.', status: 409 }); }
  });
  it('handles invalid JSON, generic HTTP failures and network failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not JSON', { status: 200 }));
    await expect(loadProfile()).rejects.toThrow('unreadable response');
    fetchMock.mockResolvedValueOnce(respond({}, 503));
    await expect(loadProfile()).rejects.toThrow('(503)');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(loadProfile()).rejects.toThrow('Could not reach the server');
  });
  it('aborts a stalled fetch after the timeout with a helpful error', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const pending = expect(loadProfile()).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await pending;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('cleans up its timeout after a successful response', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(respond(defaultData()));
    await loadProfile();
    expect(vi.getTimerCount()).toBe(0);
  });
});
