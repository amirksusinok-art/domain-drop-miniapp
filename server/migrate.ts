import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type Database } from "./db.js";
import { defaultConfig } from "./economy.js";
import { expandTlds } from "./zone-market.js";
export async function migrate(db: Database) {
  await db.transaction(async (c) => {
    if (!c.embedded) await c.query("SELECT pg_advisory_xact_lock(7346821)");
    await c.exec(await readFile(resolve("server/schema.sql"), "utf8"));
    await c.query(
      "INSERT INTO settings(id,config) VALUES(1,$1) ON CONFLICT DO NOTHING",
      [JSON.stringify(defaultConfig)],
    );
    if (
      !(await c.query("SELECT version FROM schema_migrations WHERE version=2"))
        .rowCount
    ) {
      const row = (await c.query("SELECT config FROM settings WHERE id=1"))
        .rows[0];
      await c.query(
        "UPDATE settings SET config=$1,version=version+1 WHERE id=1",
        [JSON.stringify(expandTlds(row.config))],
      );
      await c.query(
        "INSERT INTO zone_pity(user_id,tld,counter) SELECT DISTINCT ON(u.id) u.id,d.tld,u.pity FROM users u JOIN spins s ON s.user_id=u.id JOIN domains d ON d.id=s.domain_id WHERE u.pity>0 ORDER BY u.id,s.created_at DESC,s.id DESC ON CONFLICT DO NOTHING",
      );
      await c.query("INSERT INTO schema_migrations(version) VALUES(2)");
    }
  });
}
