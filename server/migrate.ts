import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type Database } from "./db.js";
import { defaultConfig } from "./economy.js";
export async function migrate(db: Database) {
  await db.transaction(async (c) => {
    if (!c.embedded) await c.query("SELECT pg_advisory_xact_lock(7346821)");
    await c.exec(await readFile(resolve("server/schema.sql"), "utf8"));
    await c.query(
      "INSERT INTO settings(id,config) VALUES(1,$1) ON CONFLICT DO NOTHING",
      [JSON.stringify(defaultConfig)],
    );
  });
}
