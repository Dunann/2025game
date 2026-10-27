import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { ActiveRun, GameConfig, RunRecord, Settings, StoredData } from '../src/types';
import { gameConfigKey, getGameConfig, parseGameConfig } from '../src/config';
import type { Database, Transaction } from './database';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxNewSessions: number;
  maxEntries: number;
  now: () => number;
}
export interface AppOptions { production?: boolean; allowedOrigins?: string[]; staticDir?: string; trustProxy?: boolean; rateLimit?: Partial<RateLimitOptions> }
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const COOKIE = 'game2025_session';
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_DURATION = SESSION_MS;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;

function parseConfig(raw: unknown): GameConfig {
  if (raw === undefined) return getGameConfig();
  const config = parseGameConfig(raw);
  if (!config) throw new HttpError(400, 'Game configuration requires 2–52 cards and a positive whole-number target within 4096 bits.');
  return config;
}
function rowConfig(row: Record<string, unknown>): GameConfig {
  return { cardCount: Number(row.card_count), target: row.target as string };
}

function parseStart(body: unknown): ActiveRun {
  if (!isObject(body) || !validId(body.id) || !validTime(body.startedAt)) throw new HttpError(400, 'A valid run ID and start timestamp are required.');
  return { id: body.id, startedAt: body.startedAt, config: parseConfig(body.config) };
}
function parseFinish(body: unknown): RunRecord {
  const start = parseStart(body);
  if (!isObject(body) || typeof body.outcome !== 'string' || !['won', 'given_up', 'abandoned'].includes(body.outcome) || !validTime(body.endedAt) || body.endedAt < start.startedAt || (body.elapsedMs !== null && (!validTime(body.elapsedMs) || body.elapsedMs > MAX_DURATION)) || (body.elapsedMs === null && body.outcome !== 'abandoned')) {
    throw new HttpError(400, 'A valid outcome, end timestamp, and elapsed duration are required.');
  }
  return { ...start, outcome: body.outcome as RunRecord['outcome'], endedAt: body.endedAt, elapsedMs: body.elapsedMs as number | null };
}
function parseSettings(body: unknown): Settings {
  if (!isObject(body) || typeof body.playingCardMode !== 'boolean') throw new HttpError(400, 'playingCardMode must be a boolean.');
  return { playingCardMode: body.playingCardMode, ...(body.gameConfig === undefined ? {} : { gameConfig: parseConfig(body.gameConfig) }) };
}

async function lockPlayer(tx: Transaction, playerId: string) {
  await tx.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
}

export function createApp(db: Database, options: AppOptions = {}) {
  const app = express();
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const allowedOrigins = new Set(options.allowedOrigins ?? (process.env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean));
  if (options.trustProxy ?? process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  // These per-process limits protect both database traffic and anonymous-player
  // creation. Count every API request before parsing bodies or looking up cookies.
  const limits: RateLimitOptions = { windowMs: 10 * 60 * 1000, maxRequests: 600, maxNewSessions: 30, maxEntries: 10_000, now: () => performance.now(), ...options.rateLimit };
  for (const key of ['windowMs', 'maxRequests', 'maxNewSessions', 'maxEntries'] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) throw new Error(`rateLimit.${key} must be a positive safe integer.`);
  }
  type Budget = { expiresAt: number; requests: number; sessions: number };
  const budgets = new Map<string, Budget>();
  const rejectRateLimit = (res: Response, expiresAt: number, now: number) => {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((expiresAt - now) / 1000))));
    res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
  };
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if ((req.path === '/health' || req.path === '/health/') && ['GET', 'HEAD'].includes(req.method)) return next();
    const now = limits.now();
    // Entries are inserted in expiry order. Prune at most 32 per request, with
    // no background timer and no unbounded scan under changing source addresses.
    let cleaned = 0;
    for (const [key, budget] of budgets) {
      if (budget.expiresAt > now || cleaned === 32) break;
      budgets.delete(key);
      cleaned++;
    }
    const address = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    // Keep map keys bounded even if a trusted proxy forwards a malformed value.
    const key = address.length > 128 ? createHash('sha256').update(address).digest('hex') : address;
    let budget = budgets.get(key);
    if (budget && budget.expiresAt <= now) { budgets.delete(key); budget = undefined; }
    if (!budget) {
      if (budgets.size >= limits.maxEntries) {
        const earliest = budgets.values().next().value as Budget | undefined;
        rejectRateLimit(res, earliest?.expiresAt ?? now + limits.windowMs, now);
        return;
      }
      budget = { expiresAt: now + limits.windowMs, requests: 0, sessions: 0 };
      budgets.set(key, budget);
    }
    if (budget.requests >= limits.maxRequests) { rejectRateLimit(res, budget.expiresAt, now); return; }
    budget.requests++;
    res.locals.rateBudget = budget;
    next();
  });
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('Origin');
      const sameOrigin = `${req.protocol}://${req.get('host')}`;
      if (!origin || (origin !== sameOrigin && !allowedOrigins.has(origin))) return next(new HttpError(403, 'This request must come from an allowed website origin.'));
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return next(new HttpError(415, 'Use application/json for this request.'));
    }
    next();
  });
  app.use('/api', express.json({ limit: '16kb', strict: true }));
  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1 AS healthy');
    res.json({ ok: true, database: db.kind });
  });

  app.use('/api', async (req, res, next) => {
    const rawCookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    let playerId: string | undefined;
    if (rawCookie && /^[a-f0-9]{64}$/.test(rawCookie)) {
      const hash = createHash('sha256').update(rawCookie).digest('hex');
      const session = await db.query('SELECT player_id FROM sessions WHERE token_hash = $1 AND expires_at > $2', [hash, Date.now()]);
      playerId = session.rows[0]?.player_id as string | undefined;
    }
    if (!playerId) {
      const budget = res.locals.rateBudget as Budget;
      if (budget.sessions >= limits.maxNewSessions) {
        rejectRateLimit(res, budget.expiresAt, limits.now());
        return;
      }
      // Increment synchronously before awaiting inserts so concurrent requests
      // without a valid session cannot all pass the same remaining allowance.
      budget.sessions++;
      playerId = randomUUID();
      const token = randomBytes(32).toString('hex');
      const hash = createHash('sha256').update(token).digest('hex');
      await db.transaction(async tx => {
        await tx.query('INSERT INTO players(id, created_at) VALUES ($1, $2)', [playerId, Date.now()]);
        await tx.query('INSERT INTO settings(player_id) VALUES ($1)', [playerId]);
        await tx.query('INSERT INTO sessions(token_hash, player_id, expires_at) VALUES ($1, $2, $3)', [hash, playerId, Date.now() + SESSION_MS]);
      });
      res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: production, maxAge: SESSION_MS, path: '/' });
    }
    res.locals.playerId = playerId;
    next();
  });

  app.get('/api/profile', async (_req, res) => {
    const profile = await db.transaction(async tx => {
      await lockPlayer(tx, res.locals.playerId);
      const settings = await tx.query('SELECT playing_card_mode, card_count, target FROM settings WHERE player_id = $1', [res.locals.playerId]);
      const records = await tx.query('SELECT id, status, started_at, ended_at, elapsed_ms, card_count, target FROM runs WHERE player_id = $1 ORDER BY started_at, id', [res.locals.playerId]);
      const runs: RunRecord[] = [];
      let activeRun: ActiveRun | null = null;
      for (const row of records.rows) {
        if (row.status === 'active') activeRun = { id: row.id as string, startedAt: Number(row.started_at), config: rowConfig(row) };
        else runs.push({ id: row.id as string, outcome: row.status as RunRecord['outcome'], startedAt: Number(row.started_at), endedAt: Number(row.ended_at), elapsedMs: row.elapsed_ms === null ? null : Number(row.elapsed_ms), config: rowConfig(row) });
      }
      return { version: 1, settings: { playingCardMode: settings.rows[0]?.playing_card_mode === true, gameConfig: rowConfig(settings.rows[0]) }, runs, startedRuns: records.rows.length, activeRun } satisfies StoredData;
    });
    res.json(profile);
  });

  app.put('/api/settings', async (req, res) => {
    const settings = parseSettings(req.body);
    if (settings.gameConfig) {
      await db.query('UPDATE settings SET playing_card_mode = $2, card_count = $3, target = $4 WHERE player_id = $1', [res.locals.playerId, settings.playingCardMode, settings.gameConfig.cardCount, settings.gameConfig.target]);
    } else {
      // A legacy display-only update must not erase a saved custom game.
      await db.query('UPDATE settings SET playing_card_mode = $2 WHERE player_id = $1', [res.locals.playerId, settings.playingCardMode]);
    }
    res.json({ ok: true });
  });

  app.post('/api/runs/start', async (req, res) => {
    const run = parseStart(req.body);
    await db.transaction(async tx => {
      await lockPlayer(tx, res.locals.playerId);
      const existing = await tx.query('SELECT status, started_at, card_count, target FROM runs WHERE player_id = $1 AND id = $2', [res.locals.playerId, run.id]);
      if (existing.rows.length) {
        if (Number(existing.rows[0].started_at) !== run.startedAt) throw new HttpError(409, 'That run ID has a different start timestamp.');
        if (gameConfigKey(rowConfig(existing.rows[0])) !== gameConfigKey(getGameConfig(run.config))) throw new HttpError(409, 'That run ID has a different game configuration.');
        return;
      }
      const active = await tx.query("SELECT id FROM runs WHERE player_id = $1 AND status = 'active'", [res.locals.playerId]);
      if (active.rows.length) throw new HttpError(409, 'Finish the current active run before starting another.');
      const config = getGameConfig(run.config);
      await tx.query("INSERT INTO runs(player_id, id, status, started_at, card_count, target) VALUES ($1, $2, 'active', $3, $4, $5)", [res.locals.playerId, run.id, run.startedAt, config.cardCount, config.target]);
    });
    res.json({ ok: true });
  });

  app.post('/api/runs/finish', async (req, res) => {
    const run = parseFinish(req.body);
    await db.transaction(async tx => {
      await lockPlayer(tx, res.locals.playerId);
      const existing = await tx.query('SELECT status, started_at, card_count, target FROM runs WHERE player_id = $1 AND id = $2', [res.locals.playerId, run.id]);
      if (!existing.rows.length) throw new HttpError(409, 'Start the run before recording its result.');
      if (Number(existing.rows[0].started_at) !== run.startedAt) throw new HttpError(409, 'The run start timestamp does not match.');
      if (gameConfigKey(rowConfig(existing.rows[0])) !== gameConfigKey(getGameConfig(run.config))) throw new HttpError(409, 'The run game configuration does not match.');
      // A terminal outcome is immutable: retries or competing finishes cannot double-record it.
      if (existing.rows[0].status !== 'active') return;
      await tx.query('UPDATE runs SET status = $3, ended_at = $4, elapsed_ms = $5 WHERE player_id = $1 AND id = $2', [res.locals.playerId, run.id, run.outcome, run.endedAt, run.elapsedMs]);
    });
    res.json({ ok: true });
  });

  app.delete('/api/stats', async (_req, res) => {
    await db.transaction(async tx => {
      await lockPlayer(tx, res.locals.playerId);
      await tx.query('DELETE FROM runs WHERE player_id = $1', [res.locals.playerId]);
    });
    res.json({ ok: true });
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API endpoint not found.' }); });

  if (production || options.staticDir) {
    const staticDir = path.resolve(options.staticDir ?? 'dist');
    app.use(express.static(staticDir));
    app.get('/{*path}', (_req: Request, res: Response) => { res.sendFile(path.join(staticDir, 'index.html')); });
  }
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (isObject(error) && error.type === 'entity.too.large') { res.status(413).json({ error: 'Request body is too large.' }); return; }
    if (error instanceof SyntaxError && isObject(error) && error.status === 400) { res.status(400).json({ error: 'Request body must be valid JSON.' }); return; }
    console.error('API request failed', error);
    res.status(500).json({ error: 'The server could not complete this request.' });
  };
  app.use(handleError);
  return app;
}
