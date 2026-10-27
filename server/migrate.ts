import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type Database } from "./db.js";
import { defaultConfig, revisedZonePrice } from "./economy.js";
import { systemDefaults } from "./systems.js";
import { expandTlds } from "./zone-market.js";
export async function migrate(db: Database) {
  await db.transaction(async (c) => {
    if (!c.embedded) await c.query("SELECT pg_advisory_xact_lock(7346821)");
    await c.exec(await readFile(resolve("server/schema.sql"), "utf8"));
    const fresh = await c.query(
      "INSERT INTO settings(id,config) VALUES(1,$1) ON CONFLICT DO NOTHING RETURNING id",
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
    await c.exec(await readFile(resolve("server/systems.sql"), "utf8"));
    await c.query(
      "INSERT INTO system_config(id,config) VALUES(1,$1) ON CONFLICT DO NOTHING",
      [JSON.stringify(systemDefaults)],
    );
    if (
      !(await c.query("SELECT version FROM schema_migrations WHERE version=4"))
        .rowCount
    ) {
      await c.query(
        "UPDATE settings SET config=jsonb_set(config,'{startingBalance}','50000') WHERE id=1",
      );
      await c.query("INSERT INTO schema_migrations(version) VALUES(4)");
    }
    if (
      !(await c.query("SELECT version FROM schema_migrations WHERE version=5"))
        .rowCount
    ) {
      if (!fresh.rowCount) {
        const old = (await c.query("SELECT config FROM settings WHERE id=1"))
          .rows[0].config;
        const config = {
          ...old,
          spinPrice: 750,
          zonePriceBase: 750,
          targetRtp: 0.8,
          tlds: old.tlds.map((t: any) => ({
            ...t,
            spinPrice: revisedZonePrice(
              t.name,
              t.spinPrice ??
                Math.max(
                  100,
                  Math.round(
                    (old.spinPrice * t.multiplier * t.multiplier) / 100,
                  ) * 50,
                ),
            ),
          })),
        };
        await c.query(
          "UPDATE settings SET config=$1,version=version+1 WHERE id=1",
          [JSON.stringify(config)],
        );
      }
      const sys = (await c.query("SELECT config FROM system_config WHERE id=1"))
        .rows[0].config;
      await c.query("UPDATE system_config SET config=$1 WHERE id=1", [
        JSON.stringify({
          ...sys,
          quickCosts: [3000, 7500, 15000, 30000, 60000],
          quickRequiredSpins: [0, 50, 150, 300, 500],
        }),
      ]);
      await c.query("UPDATE events SET boost=LEAST(boost,1.3)");
      await c.query(
        "ALTER TABLE events DROP CONSTRAINT IF EXISTS events_boost_check",
      );
      await c.query(
        "ALTER TABLE events ADD CONSTRAINT events_boost_check CHECK(boost>=1 AND boost<=1.3)",
      );
      await c.query("INSERT INTO schema_migrations(version) VALUES(5)");
    }
    await c.exec(await readFile(resolve("server/play-features.sql"), "utf8"));
    await c.query(
      "INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING",
    );
    await c.query(
      "INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING",
    );
  });
}
