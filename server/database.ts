import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export interface QueryResult { rows: Record<string, unknown>[] }
export interface Transaction { query(sql: string, parameters?: unknown[]): Promise<QueryResult> }
export interface Database extends Transaction {
  kind: 'postgres' | 'pglite';
  transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const migrations = [{ version: 1, path: new URL('./migrations/001_initial.sql', import.meta.url) }];

async function migrate(db: Database) {
  await db.transaction(async tx => {
    if (db.kind === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(2025, 1)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const migration of migrations) {
      const existing = await tx.query('SELECT version FROM schema_migrations WHERE version = $1', [migration.version]);
      if (existing.rows.length === 0) {
        const sql = await readFile(fileURLToPath(migration.path), 'utf8');
        await tx.query(sql);
        await tx.query('INSERT INTO schema_migrations(version) VALUES ($1)', [migration.version]);
      }
    }
  });
}

export async function createDatabase(options: { connectionString?: string; dataDir?: string } = {}): Promise<Database> {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  let db: Database;
  if (connectionString) {
    const pool = new pg.Pool({ connectionString, max: 10 });
    db = {
      kind: 'postgres',
      query: async (sql, parameters = []) => {
        const result = await pool.query(sql, parameters);
        return { rows: result.rows ?? [] };
      },
      transaction: async work => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await work({ query: async (sql, parameters = []) => {
            const response = await client.query(sql, parameters);
            // Multi-statement migrations return an array; callers need no rows in that case.
            return { rows: Array.isArray(response) ? [] : response.rows ?? [] };
          } });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production.');
    const dataDir = options.dataDir ?? process.env.PGLITE_DATA_DIR ?? './.data/postgres';
    // PGlite creates its database files, but its Node filesystem needs the parent
    // hierarchy to exist on a fresh checkout.
    if (dataDir !== 'memory://') await mkdir(dataDir, { recursive: true });
    const engine = new PGlite(dataDir);
    await engine.waitReady;
    // PGlite shares one connection. Queue entire transactions and standalone queries together.
    let tail: Promise<unknown> = Promise.resolve();
    const queue = <T>(work: () => Promise<T>): Promise<T> => {
      const result = tail.then(work, work);
      tail = result.catch(() => undefined);
      return result;
    };
    db = {
      kind: 'pglite',
      query: (sql, parameters = []) => queue(async () => {
        const response = await engine.query(sql, parameters);
        return { rows: response.rows as Record<string, unknown>[] };
      }),
      transaction: work => queue(() => engine.transaction(async tx => work({ query: async (sql, parameters = []) => {
        if (parameters.length === 0 && sql.includes(';')) {
          await tx.exec(sql);
          return { rows: [] };
        }
        const response = await tx.query(sql, parameters);
        return { rows: response.rows as Record<string, unknown>[] };
      } }))),
      close: () => queue(() => engine.close()),
    };
  }
  try { await migrate(db); } catch (error) { await db.close(); throw error; }
  return db;
}
