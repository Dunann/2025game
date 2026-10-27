import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquirePlayerTabLock } from './sessionLock';

type LockCallback = (lock: Lock | null) => void | Promise<void>;

describe('exclusive player tab ownership', () => {
  let documentWindow: Window;
  let request: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    documentWindow = {} as Window;
    request = vi.fn();
    vi.stubGlobal('window', documentWindow);
    vi.stubGlobal('navigator', { locks: { request } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('takes an exclusive non-waiting lock and retains it after acquisition', async () => {
    let held: void | Promise<void>;
    request.mockImplementation((_name: string, _options: LockOptions, callback: LockCallback) => {
      held = callback({ name: '2025-player-session', mode: 'exclusive' } as Lock);
      return held;
    });
    await acquirePlayerTabLock();
    expect(request).toHaveBeenCalledWith('2025-player-session', { mode: 'exclusive', ifAvailable: true }, expect.any(Function));
    expect(documentWindow.__game2025PlayerTabLock).toBeDefined();
    const settled = vi.fn();
    void Promise.resolve(held!).then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });

  it('reuses one promise across concurrent calls and StrictMode-style remounts', async () => {
    let callback!: LockCallback;
    request.mockImplementation((_name: string, _options: LockOptions, cb: LockCallback) => {
      callback = cb;
      return new Promise<void>(() => {});
    });
    const first = acquirePlayerTabLock();
    expect(acquirePlayerTabLock()).toBe(first);
    callback({} as Lock);
    await first;
    expect(acquirePlayerTabLock()).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('refuses another tab, clears failed ownership, and permits retry after that tab closes', async () => {
    request.mockImplementationOnce(async (_name: string, _options: LockOptions, callback: LockCallback) => callback(null));
    await expect(acquirePlayerTabLock()).rejects.toThrow('This table is already open in another tab. Close the other game tab, then retry.');
    expect(documentWindow.__game2025PlayerTabLock).toBeUndefined();
    request.mockImplementationOnce((_name: string, _options: LockOptions, callback: LockCallback) => callback({} as Lock));
    await expect(acquirePlayerTabLock()).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shares ownership across hot module reloads through the document window', async () => {
    request.mockImplementation((_name: string, _options: LockOptions, callback: LockCallback) => callback({} as Lock));
    const first = acquirePlayerTabLock();
    await first;
    vi.resetModules();
    const reloaded = await import('./sessionLock');
    expect(reloaded.acquirePlayerTabLock()).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('explains required browser support without attempting unsafe recovery', async () => {
    vi.stubGlobal('navigator', {});
    await expect(acquirePlayerTabLock()).rejects.toThrow('Web Locks support');
    expect(documentWindow.__game2025PlayerTabLock).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('clears acquisition after a browser request error so retry remains possible', async () => {
    request.mockRejectedValueOnce(new Error('Browser lock failure'));
    await expect(acquirePlayerTabLock()).rejects.toThrow('Browser lock failure');
    expect(documentWindow.__game2025PlayerTabLock).toBeUndefined();
    request.mockImplementationOnce((_name: string, _options: LockOptions, callback: LockCallback) => callback({} as Lock));
    await expect(acquirePlayerTabLock()).resolves.toBeUndefined();
  });
});
