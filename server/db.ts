import "dotenv/config";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
export interface DBClient {
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
  exec(sql: string): Promise<void>;
  embedded: boolean;
}
export interface Database extends DBClient {
  transaction<T>(fn: (db: DBClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function database(
  url = process.env.DATABASE_URL,
  memory = false,
): Promise<Database> {
  if (url) {
    const schema = process.env.DATABASE_SCHEMA || "public";
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid DATABASE_SCHEMA");
    const pool = new pg.Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    if (schema !== "public")
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    const wrap = (client: pg.Pool | pg.PoolClient): DBClient => ({
      embedded: false,
      query: async (sql, params) => {
        const r = await client.query(sql, params);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
      },
      exec: async (sql) => {
        await client.query(sql);
      },
    });
    return {
      ...wrap(pool),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const result = await fn(wrap(c));
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Production requires DATABASE_URL");
  const pgLocal = new PGlite(memory ? undefined : ".local-db");
  await pgLocal.waitReady;
  let tail = Promise.resolve();
  async function lock<T>(fn: () => Promise<T>) {
    const prev = tail;
    let release!: () => void;
    tail = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  const client: DBClient = {
    embedded: true,
    query: async (sql, params) => {
      const r = await pgLocal.query<any>(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
    },
    exec: async (sql) => {
      await pgLocal.exec(sql);
    },
  };
  return {
    embedded: true,
    query: (sql, params) => lock(() => client.query(sql, params)),
    exec: (sql) => lock(() => client.exec(sql)),
    transaction: (fn) =>
      lock(async () => {
        await client.exec("BEGIN");
        try {
          const result = await fn(client);
          await client.exec("COMMIT");
          return result;
        } catch (e) {
          await client.exec("ROLLBACK");
          throw e;
        }
      }),
    close: () => pgLocal.close(),
  };
}
