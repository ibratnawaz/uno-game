/** Persistence for room snapshots. Rooms are small JSON documents keyed by room code. */
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface Store {
  /** Returns every persisted room as raw JSON. */
  load(): Promise<string[]>;
  save(code: string, json: string): Promise<void>;
  remove(code: string): Promise<void>;
  close?(): Promise<void>;
}

export class MemoryStore implements Store {
  data = new Map<string, string>();
  async load() {
    return [...this.data.values()];
  }
  async save(code: string, json: string) {
    this.data.set(code, json);
  }
  async remove(code: string) {
    this.data.delete(code);
  }
}

/** One JSON file per room, written atomically (temp file + rename). */
export class FileStore implements Store {
  constructor(private dir: string) {}
  private file = (code: string) => path.join(this.dir, `${code.replace(/[^A-Z0-9]/gi, '')}.json`);
  async load() {
    await mkdir(this.dir, { recursive: true });
    const out: string[] = [];
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        out.push(await readFile(path.join(this.dir, f), 'utf8'));
      } catch {
        /* skip unreadable files */
      }
    }
    return out;
  }
  async save(code: string, json: string) {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(code)}.${process.pid}.tmp`;
    await writeFile(tmp, json);
    await rename(tmp, this.file(code));
  }
  async remove(code: string) {
    await unlink(this.file(code)).catch(() => undefined);
  }
}

/**
 * Postgres (e.g. a free Supabase/Neon database). A single jsonb table keeps this trivial.
 * NOTE: not exercised by the automated tests (needs a live database) - see README.
 */
export class PostgresStore implements Store {
  private pool: import('pg').Pool | null = null;
  constructor(private url: string) {}
  private async db() {
    if (!this.pool) {
      const { default: pg } = await import('pg');
      this.pool = new pg.Pool({
        connectionString: this.url,
        max: 4,
        ssl: { rejectUnauthorized: false },
      });
      await this.pool.query(
        'create table if not exists chromarush_rooms (code text primary key, data jsonb not null, updated_at timestamptz not null default now())',
      );
    }
    return this.pool;
  }
  async load() {
    const db = await this.db();
    const res = await db.query('select data from chromarush_rooms');
    return res.rows.map((r) => JSON.stringify(r.data));
  }
  async save(code: string, json: string) {
    const db = await this.db();
    await db.query(
      'insert into chromarush_rooms (code, data, updated_at) values ($1, $2::jsonb, now()) on conflict (code) do update set data = excluded.data, updated_at = now()',
      [code, json],
    );
  }
  async remove(code: string) {
    const db = await this.db();
    await db.query('delete from chromarush_rooms where code = $1', [code]);
  }
  async close() {
    await this.pool?.end();
  }
}
