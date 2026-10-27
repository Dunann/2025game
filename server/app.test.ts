import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { StoredData } from '../src/types';
import { createApp } from './app';
import { createDatabase, type Database } from './database';

const standardConfig = { cardCount: 8, target: '2025' };

describe('database-backed HTTP API', () => {
  let db: Database;
  let server: Server;
  let origin: string;
  function client() {
    let cookie = '';
    return async (route: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return response;
    };
  }
  const run = { id: 'run-one', startedAt: 1000 };
  const finish = { ...run, endedAt: 2500, elapsedMs: 1500, outcome: 'won' };
  beforeAll(async () => {
    db = await createDatabase({ dataDir: 'memory://' });
    server = createApp(db).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server.');
    origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (db) await db.close();
  });

  it('returns database health without creating an anonymous player', async () => {
    const response = await fetch(`${origin}/api/health`);
    expect(await response.json()).toEqual({ ok: true, database: 'pglite' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('issues an opaque HttpOnly cookie and persists only its hash', async () => {
    const request = client();
    const response = await request('/api/profile');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const token = cookie.split(';')[0].split('=')[1];
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const sessions = await db.query('SELECT token_hash FROM sessions');
    expect(sessions.rows.every(row => row.token_hash !== token)).toBe(true);
    expect(await response.json()).toEqual({ version: 1, settings: { playingCardMode: false, gameConfig: standardConfig }, runs: [], startedRuns: 0, activeRun: null });
    expect((await request('/api/profile')).headers.get('set-cookie')).toBeNull();
  });

  it('isolates players, settings, and identically named runs', async () => {
    const alice = client(), bob = client();
    await alice('/api/profile'); await bob('/api/profile');
    expect((await alice('/api/settings', 'PUT', { playingCardMode: true })).status).toBe(200);
    expect((await alice('/api/runs/start', 'POST', run)).status).toBe(200);
    expect((await bob('/api/runs/start', 'POST', run)).status).toBe(200);
    expect((await alice('/api/runs/finish', 'POST', finish)).status).toBe(200);
    const a = await (await alice('/api/profile')).json() as StoredData;
    const b = await (await bob('/api/profile')).json() as StoredData;
    expect(a.settings.playingCardMode).toBe(true);
    expect(b.settings.playingCardMode).toBe(false);
    expect(a.runs).toEqual([{ ...finish, config: standardConfig }]);
    expect(a.activeRun).toBeNull();
    expect(b.runs).toEqual([]);
    expect(b.activeRun).toEqual({ ...run, config: standardConfig });
  });

  it('starts once, rejects another active attempt, and freezes the first terminal result', async () => {
    const request = client(); await request('/api/profile');
    expect((await request('/api/runs/start', 'POST', run)).status).toBe(200);
    expect((await request('/api/runs/start', 'POST', run)).status).toBe(200);
    expect((await request('/api/runs/start', 'POST', { ...run, startedAt: 1001 })).status).toBe(409);
    expect((await request('/api/runs/start', 'POST', { ...run, id: 'other-run' })).status).toBe(409);
    const responses = await Promise.all([
      request('/api/runs/finish', 'POST', finish),
      request('/api/runs/finish', 'POST', { ...finish, outcome: 'given_up', elapsedMs: 2000 }),
    ]);
    expect(responses.every(response => response.status === 200)).toBe(true);
    await request('/api/runs/finish', 'POST', finish);
    const profile = await (await request('/api/profile')).json() as StoredData;
    expect(profile.startedRuns).toBe(1);
    expect(profile.runs).toHaveLength(1);
    expect(['won', 'given_up']).toContain(profile.runs[0].outcome);
    expect((await request('/api/runs/start', 'POST', run)).status).toBe(200);
    expect((await (await request('/api/profile')).json() as StoredData).activeRun).toBeNull();
  });

  it('accepts interrupted abandonment with unknown duration and preserves settings on reset', async () => {
    const request = client(); await request('/api/profile');
    await request('/api/settings', 'PUT', { playingCardMode: true });
    await request('/api/runs/start', 'POST', run);
    expect((await request('/api/runs/finish', 'POST', { ...finish, outcome: 'abandoned', elapsedMs: null })).status).toBe(200);
    expect((await request('/api/stats', 'DELETE')).status).toBe(200);
    const profile = await (await request('/api/profile')).json() as StoredData;
    expect(profile).toEqual({ version: 1, settings: { playingCardMode: true, gameConfig: standardConfig }, runs: [], startedRuns: 0, activeRun: null });
  });

  it('rejects unstarted finishes, mismatched timestamps, and invalid values', async () => {
    const request = client(); await request('/api/profile');
    expect((await request('/api/runs/finish', 'POST', finish)).status).toBe(409);
    await request('/api/runs/start', 'POST', run);
    expect((await request('/api/runs/finish', 'POST', { ...finish, startedAt: 900 })).status).toBe(409);
    for (const body of [
      { ...finish, elapsedMs: -1 }, { ...finish, elapsedMs: null },
      { ...finish, elapsedMs: 31536000001 }, { ...finish, endedAt: 999 },
      { ...finish, startedAt: null }, { ...finish, outcome: 'active' },
      { ...finish, id: 'x'.repeat(201) }, { ...finish, id: 'sql;--' },
    ]) expect((await request('/api/runs/finish', 'POST', body)).status).toBe(400);
    expect((await request('/api/settings', 'PUT', { playingCardMode: 'true' })).status).toBe(400);
    expect((await request('/api/runs/start', 'POST', { id: 'another', startedAt: -1 })).status).toBe(400);
  });

  it('blocks foreign origins, missing origins, non-JSON writes, oversized and malformed JSON', async () => {
    const request = client(); await request('/api/profile');
    expect((await request('/api/settings', 'PUT', { playingCardMode: true }, { Origin: 'https://attacker.example' })).status).toBe(403);
    expect((await request('/api/settings', 'PUT', { playingCardMode: true }, { Origin: '' })).status).toBe(403);
    expect((await request('/api/settings', 'PUT', { playingCardMode: true }, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await request('/api/settings', 'PUT', { oversized: 'x'.repeat(17000) })).status).toBe(413);
    const malformed = await fetch(`${origin}/api/settings`, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{bad' });
    expect(malformed.status).toBe(400);
    expect((await request('/api/unknown')).status).toBe(404);
  });

  it('persists canonical custom settings, preserves them on legacy display updates, and isolates players', async () => {
    const alice = client(), bob = client();
    await alice('/api/profile'); await bob('/api/profile');
    const gameConfig = { cardCount: 52, target: '9007199254740993123456789' };
    expect((await alice('/api/settings', 'PUT', { playingCardMode: true, gameConfig: { ...gameConfig, target: `000${gameConfig.target}` } })).status).toBe(200);
    expect((await (await alice('/api/profile')).json() as StoredData).settings).toEqual({ playingCardMode: true, gameConfig });
    await alice('/api/settings', 'PUT', { playingCardMode: false });
    expect((await (await alice('/api/profile')).json() as StoredData).settings).toEqual({ playingCardMode: false, gameConfig });
    expect((await (await bob('/api/profile')).json() as StoredData).settings.gameConfig).toEqual(standardConfig);
    await alice('/api/stats', 'DELETE');
    expect((await (await alice('/api/profile')).json() as StoredData).settings.gameConfig).toEqual(gameConfig);
  });

  it('snapshots custom run configuration and rejects changes at start retry or finish', async () => {
    const request = client(); await request('/api/profile');
    const config = { cardCount: 2, target: '42' };
    const customRun = { ...run, config };
    await request('/api/settings', 'PUT', { playingCardMode: false, gameConfig: config });
    expect((await request('/api/runs/start', 'POST', customRun)).status).toBe(200);
    expect((await request('/api/runs/start', 'POST', { ...customRun, config: { ...config, target: '00042' } })).status).toBe(200);
    expect((await request('/api/runs/start', 'POST', run)).status).toBe(409);
    expect((await request('/api/runs/start', 'POST', { ...customRun, config: { ...config, cardCount: 3 } })).status).toBe(409);
    await request('/api/settings', 'PUT', { playingCardMode: true, gameConfig: { cardCount: 13, target: '99' } });
    expect((await (await request('/api/profile')).json() as StoredData).activeRun).toEqual(customRun);
    expect((await request('/api/runs/finish', 'POST', finish)).status).toBe(409);
    expect((await request('/api/runs/finish', 'POST', { ...finish, config: { ...config, target: '43' } })).status).toBe(409);
    const customFinish = { ...finish, config };
    expect((await request('/api/runs/finish', 'POST', customFinish)).status).toBe(200);
    expect((await request('/api/runs/finish', 'POST', customFinish)).status).toBe(200);
    expect((await request('/api/runs/finish', 'POST', finish)).status).toBe(409);
    const profile = await (await request('/api/profile')).json() as StoredData;
    expect(profile.runs).toEqual([customFinish]);
    expect(profile.settings.gameConfig).toEqual({ cardCount: 13, target: '99' });
  });

  it('assigns the standard configuration to legacy runs despite custom preferences', async () => {
    const request = client(); await request('/api/profile');
    await request('/api/settings', 'PUT', { playingCardMode: true, gameConfig: { cardCount: 2, target: '24' } });
    expect((await request('/api/runs/start', 'POST', run)).status).toBe(200);
    expect((await (await request('/api/profile')).json() as StoredData).activeRun?.config).toEqual(standardConfig);
    expect((await request('/api/runs/finish', 'POST', finish)).status).toBe(200);
    expect((await (await request('/api/profile')).json() as StoredData).runs[0].config).toEqual(standardConfig);
  });

  it('rejects malformed game configurations at every write boundary', async () => {
    const request = client(); await request('/api/profile');
    await request('/api/runs/start', 'POST', run);
    const invalidConfigs: unknown[] = [null, {}, [], { cardCount: 1, target: '24' }, { cardCount: 53, target: '24' }, { cardCount: 2.5, target: '24' }, { cardCount: '8', target: '24' },
      ...['0', '-1', '+1', '1.5', '1e3', '', '0'.repeat(1235), (1n << 4096n).toString()].map(target => ({ cardCount: 8, target })),
      { cardCount: 8, target: 2025 },
    ];
    for (const config of invalidConfigs) {
      expect((await request('/api/settings', 'PUT', { playingCardMode: false, gameConfig: config })).status).toBe(400);
      expect((await request('/api/runs/start', 'POST', { ...run, config })).status).toBe(400);
      expect((await request('/api/runs/finish', 'POST', { ...finish, config })).status).toBe(400);
    }
    const maximumTarget = ((1n << 4096n) - 1n).toString();
    expect((await request('/api/settings', 'PUT', { playingCardMode: false, gameConfig: { cardCount: 52, target: maximumTarget } })).status).toBe(200);
    expect((await (await request('/api/profile')).json() as StoredData).settings.gameConfig?.target).toBe(maximumTarget);
  });
});

it('persists PostgreSQL data on disk and reopens without reapplying migrations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), '2025-db-test-'));
  const dataDir = path.join(directory, 'new-parent', 'nested', 'postgres');
  let db: Database | undefined;
  try {
    db = await createDatabase({ dataDir });
    await expect(createDatabase({ dataDir })).rejects.toThrow('already open');
    await db.query('INSERT INTO players(id, created_at) VALUES ($1, $2)', ['persistent-player', 100]);
    await db.close(); db = undefined;
    db = await createDatabase({ dataDir });
    expect((await db.query('SELECT id FROM players')).rows).toEqual([{ id: 'persistent-player' }]);
    expect((await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows).toEqual([{ version: 1 }, { version: 2 }]);
  } finally {
    if (db) await db.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

it('migrates existing settings, active and terminal runs to standard configuration without losing data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), '2025-legacy-db-test-'));
  let legacy: PGlite | undefined;
  let db: Database | undefined;
  try {
    legacy = new PGlite(directory);
    await legacy.waitReady;
    await legacy.exec(await readFile(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8'));
    await legacy.exec('CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(version) VALUES (1);');
    await legacy.query('INSERT INTO players(id, created_at) VALUES ($1, $2)', ['legacy-player', 10]);
    await legacy.query('INSERT INTO settings(player_id, playing_card_mode) VALUES ($1, true)', ['legacy-player']);
    await legacy.query("INSERT INTO runs(player_id,id,status,started_at) VALUES ($1,'legacy-active','active',100)", ['legacy-player']);
    await legacy.query("INSERT INTO runs(player_id,id,status,started_at,ended_at,elapsed_ms) VALUES ($1,'legacy-win','won',10,20,10)", ['legacy-player']);
    await legacy.close(); legacy = undefined;
    db = await createDatabase({ dataDir: directory });
    expect((await db.query('SELECT playing_card_mode,card_count,target FROM settings')).rows).toEqual([{ playing_card_mode: true, card_count: 8, target: '2025' }]);
    expect((await db.query('SELECT id,status,card_count,target FROM runs ORDER BY id')).rows).toEqual([
      { id: 'legacy-active', status: 'active', card_count: 8, target: '2025' },
      { id: 'legacy-win', status: 'won', card_count: 8, target: '2025' },
    ]);
    expect((await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows).toEqual([{ version: 1 }, { version: 2 }]);
    // Constraints protect both tables even if a future writer bypasses HTTP validation.
    await expect(db.query("UPDATE settings SET card_count = 1")).rejects.toThrow();
    await expect(db.query("UPDATE settings SET target = '00042'")).rejects.toThrow();
    await expect(db.query("UPDATE runs SET target = '-1'")).rejects.toThrow();
    await expect(db.query("UPDATE runs SET target = $1", ['1'.repeat(1235)])).rejects.toThrow();
    expect((await db.query('SELECT elapsed_ms FROM runs WHERE id = $1', ['legacy-win'])).rows).toEqual([{ elapsed_ms: 10 }]);
  } finally {
    if (legacy) await legacy.close();
    if (db) await db.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

it('requires external PostgreSQL in production', async () => {
  const oldEnvironment = process.env.NODE_ENV;
  const oldUrl = process.env.DATABASE_URL;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    await expect(createDatabase({ dataDir: 'memory://' })).rejects.toThrow('DATABASE_URL is required');
  } finally {
    if (oldEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnvironment;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
  }
});

it('marks production cookies Secure and accepts only explicitly allowed development origins', async () => {
  const db = await createDatabase({ dataDir: 'memory://' });
  const server = createApp(db, { production: true, allowedOrigins: ['http://localhost:5173'] }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server.');
    const url = `http://127.0.0.1:${address.port}`;
    const profile = await fetch(`${url}/api/profile`);
    const cookie = profile.headers.get('set-cookie')!;
    expect(cookie).toContain('Secure');
    const headers = { Cookie: cookie.split(';')[0], Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };
    expect((await fetch(`${url}/api/settings`, { method: 'PUT', headers, body: JSON.stringify({ playingCardMode: true }) })).status).toBe(200);
    expect((await fetch(`${url}/api/settings`, { method: 'PUT', headers: { ...headers, Origin: 'http://localhost:5174' }, body: JSON.stringify({ playingCardMode: true }) })).status).toBe(403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
}, 30000);
