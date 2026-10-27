import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from './database';

const mocked = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock('pg', () => ({ default: { Pool: class { constructor(options: unknown) { return mocked.construct(options); } } } }));

describe('hosted PostgreSQL adapter', () => {
  let pool: EventEmitter & { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  const url = 'postgresql://example:private-password@project-pooler.example.invalid/game?sslmode=verify-full';
  beforeEach(() => {
    client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    pool = Object.assign(new EventEmitter(), { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) });
    mocked.construct.mockReset().mockReturnValue(pool);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('preserves provider TLS options and sets a bounded cold-start connection timeout', async () => {
    const db = await createDatabase({ connectionString: url });
    expect(mocked.construct).toHaveBeenCalledWith({ connectionString: url, max: 10, connectionTimeoutMillis: 15_000 });
    expect(mocked.construct.mock.calls[0][0]).not.toHaveProperty('ssl');
    expect(db.kind).toBe('postgres');
    await db.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('handles idle connection error events without an uncaught exception or logging credentials', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await createDatabase({ connectionString: url });
    const failure = Object.assign(new Error(`Disconnected: ${url}`), { code: 'ECONNRESET' });
    expect(() => pool.emit('error', failure)).not.toThrow();
    expect(errorLog).toHaveBeenCalledWith('An idle PostgreSQL connection failed.', { code: 'ECONNRESET' });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private-password');
    pool.query.mockResolvedValueOnce({ rows: [{ healthy: 1 }] });
    expect(await db.query('SELECT 1 AS healthy')).toEqual({ rows: [{ healthy: 1 }] });
    await db.close();
  });

  it('runs migrations on one checked-out transaction with transaction-scoped locking', async () => {
    const db = await createDatabase({ connectionString: url });
    const calls = client.query.mock.calls;
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();
    expect(calls[0][0]).toBe('BEGIN');
    expect(calls[1][0]).toBe('SELECT pg_advisory_xact_lock(2025, 1)');
    expect(calls.some(([sql]) => String(sql).includes('CREATE TABLE IF NOT EXISTS players'))).toBe(true);
    expect(calls.some(([sql]) => String(sql).includes('ALTER TABLE settings'))).toBe(true);
    expect(calls.filter(([sql]) => String(sql).startsWith('INSERT INTO schema_migrations')).map(([, params]) => params)).toEqual([[1], [2]]);
    expect(calls.at(-1)![0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
    await db.close();
  });

  it('releases successful transactions and returns their result', async () => {
    const db = await createDatabase({ connectionString: url });
    client.query.mockClear(); client.release.mockClear();
    client.query.mockImplementation(async (sql: string) => ({ rows: sql === 'SELECT $1 AS value' ? [{ value: 7 }] : [] }));
    expect(await db.transaction(async tx => (await tx.query('SELECT $1 AS value', [7])).rows[0])).toEqual({ value: 7 });
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'SELECT $1 AS value', 'COMMIT']);
    expect(client.release).toHaveBeenCalledExactlyOnceWith();
    await db.close();
  });

  it('rolls back a failed transaction and releases a reusable client', async () => {
    const db = await createDatabase({ connectionString: url });
    client.query.mockClear(); client.release.mockClear();
    const failure = new Error('Run write failed.');
    await expect(db.transaction(async () => { throw failure; })).rejects.toBe(failure);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledExactlyOnceWith();
    await db.close();
  });

  it('preserves the original failure and discards a client when rollback also fails', async () => {
    const db = await createDatabase({ connectionString: url });
    client.release.mockClear();
    const original = new Error('Original write failed.');
    const rollback = new Error('Connection closed.');
    client.query.mockImplementation(async (sql: string) => { if (sql === 'ROLLBACK') throw rollback; return { rows: [] }; });
    await expect(db.transaction(async () => { throw original; })).rejects.toBe(original);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(rollback);
    await db.close();
  });

  it('propagates acquisition failure without attempting to release an unacquired client', async () => {
    const db = await createDatabase({ connectionString: url });
    client.release.mockClear();
    const failure = new Error('Database wake-up timed out.');
    pool.connect.mockRejectedValueOnce(failure);
    await expect(db.transaction(async () => undefined)).rejects.toBe(failure);
    expect(client.release).not.toHaveBeenCalled();
    await db.close();
  });
});
