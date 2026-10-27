import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { database, type Database } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import { createApp } from "../server/app.js";
import { login } from "../server/auth.js";
import { defaultConfig, evaluate } from "../server/economy.js";
import * as game from "../server/game.js";
import { pickAuction } from "../server/play-features.js";
let db: Database, server: Server, base: string;
before(async () => {
  db = await database(process.env.TEST_DATABASE_URL, true);
  await migrate(db);
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});
const user = (id: number) =>
  login(db, { id, first_name: "Игрок", username: "u" + id });
async function req(
  token: string,
  path: string,
  body?: unknown,
  key = randomUUID(),
) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as any };
}
async function common(userId: string, patch: Record<string, unknown> = {}) {
  return db.transaction(async (c) => {
    const drop = {
      ...evaluate("project54", defaultConfig.tlds[0], defaultConfig),
      ...patch,
    };
    return game.insertDomain(c, userId, drop, "kept", "admin");
  });
}

test("Auction scheduler fills one daily and four timed live slots, preserves old bids and never repeats recent exact domains", async () => {
  const u = await user(801);
  const id = randomUUID();
  const d = evaluate(
    "777",
    defaultConfig.tlds.find((t) => t.name === "ai")!,
    defaultConfig,
  );
  await db.query(
    "INSERT INTO auctions(id,domain,ends_at,start_price,bid,bidder_id) VALUES($1,$2,now()+interval '1 hour',1000,1500,$3)",
    [id, JSON.stringify(d), u.userId],
  );
  await game.scheduler(db);
  await game.scheduler(db);
  let auto = (await db.query("SELECT * FROM auctions WHERE slot IS NOT NULL"))
    .rows;
  assert.equal(auto.length, 5);
  assert.equal(auto.filter((a) => a.kind === "daily").length, 1);
  assert.equal(auto.filter((a) => a.kind === "live").length, 4);
  assert.equal(
    new Set(auto.map((a) => a.domain.name + "." + a.domain.tld)).size,
    5,
  );
  assert.ok(
    auto.every((a) => !["COMMON", "UNCOMMON"].includes(a.domain.rarity)),
  );
  assert.equal(
    Number(
      (await db.query("SELECT bid FROM auctions WHERE id=$1", [id])).rows[0]
        .bid,
    ),
    1500,
  );
  for (let round = 0; round < 5; round++) {
    await db.query(
      "UPDATE auctions SET ends_at=now()-interval '1 second' WHERE slot IS NOT NULL AND status='active'",
    );
    await game.scheduler(db);
  }
  auto = (
    await db.query(
      "SELECT * FROM auctions WHERE slot IS NOT NULL ORDER BY starts_at DESC,id DESC LIMIT 20",
    )
  ).rows;
  assert.equal(
    new Set(auto.map((a) => a.domain.name + "." + a.domain.tld)).size,
    20,
  );
  await migrate(db);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM auctions WHERE status='active' AND slot IS NOT NULL",
      )
    ).rowCount,
    5,
  );
});
test("Auction rarity pool implements approved weight boundaries and exclusions", () => {
  for (const [roll, rarity] of [
    [0, "RARE"],
    [0.6499, "RARE"],
    [0.65, "EPIC"],
    [0.93, "LEGENDARY"],
    [0.999, "MYTHIC"],
  ] as const) {
    let call = 0;
    assert.equal(
      pickAuction(defaultConfig, "live", new Set(), () =>
        call++ === 0 ? roll : 0,
      )?.rarity,
      rarity,
    );
  }
  for (const [roll, rarity] of [
    [0, "EPIC"],
    [0.65, "LEGENDARY"],
    [0.999, "MYTHIC"],
  ] as const) {
    let call = 0;
    assert.equal(
      pickAuction(defaultConfig, "daily", new Set(), () =>
        call++ === 0 ? roll : 0,
      )?.rarity,
      rarity,
    );
  }
  const one = pickAuction(defaultConfig, "live", new Set(), () => 0)!;
  const two = pickAuction(
    defaultConfig,
    "live",
    new Set([one.name + "." + one.tld]),
    () => 0,
  )!;
  assert.notEqual(one.name + "." + one.tld, two.name + "." + two.tld);
});
test("Watchlist is private, persisted, idempotent and includes ended lots without exposing user IDs", async () => {
  const u = await user(802),
    v = await user(803),
    a = (
      await db.query("SELECT id FROM auctions WHERE status='active' LIMIT 1")
    ).rows[0];
  const key = randomUUID();
  assert.equal(
    (await req(u.token, "/auction/watch", { id: a.id, watched: true }, key))
      .status,
    200,
  );
  assert.equal(
    (await req(u.token, "/auction/watch", { id: a.id, watched: true }, key))
      .status,
    200,
  );
  assert.equal(
    (await req(u.token, "/auctions")).body.find((x: any) => x.id === a.id)
      .watched,
    true,
  );
  assert.equal(
    (await req(v.token, "/auctions")).body.find((x: any) => x.id === a.id)
      .watched,
    false,
  );
  await db.query(
    "UPDATE auctions SET ends_at=now()-interval '1 second' WHERE id=$1",
    [a.id],
  );
  await game.scheduler(db);
  const row = (await req(u.token, "/auctions")).body.find(
    (x: any) => x.id === a.id,
  );
  assert.equal(row.watched, true);
  assert.equal(row.status, "settled");
  assert.equal(row.bidder_id, undefined);
  await req(u.token, "/auction/watch", { id: a.id, watched: false });
  assert.equal(
    (await req(u.token, "/auctions")).body.find((x: any) => x.id === a.id)
      .watched,
    false,
  );
});
test("Sell All Common quotes whole collection, protects valuable items and pays the exact server snapshot once", async () => {
  const u = await user(804),
    v = await user(805);
  const a = await common(u.userId),
    b = await common(u.userId);
  await common(v.userId);
  for (const flag of ["favorite", "vaulted", "showcase"]) {
    const id = await common(u.userId);
    await db.query(`UPDATE domains SET ${flag}=true WHERE id=$1`, [id]);
  }
  await common(u.userId, { tags: ["SHORT"] });
  await common(u.userId, { rarity: "RARE" });
  const preview = (await req(u.token, "/collection/common/preview", {})).body
    .data;
  assert.equal(preview.count, 2);
  const before = (await req(u.token, "/state")).body.profile.coins,
    key = randomUUID();
  assert.equal(
    (await req(v.token, "/collection/common/sell", { id: preview.id })).status,
    409,
  );
  const result = await req(
    u.token,
    "/collection/common/sell",
    { id: preview.id },
    key,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.state.profile.coins, before + preview.total);
  assert.equal(
    (await req(u.token, "/collection/common/sell", { id: preview.id }, key))
      .body.state.profile.coins,
    before + preview.total,
  );
  assert.equal(
    (await req(u.token, "/collection/common/sell", { id: preview.id })).status,
    409,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM domains WHERE id=ANY($1::uuid[]) AND status='sold'",
        [[a, b]],
      )
    ).rowCount,
    2,
  );
  assert.equal(
    (
      await db.query(
        "SELECT * FROM transactions WHERE user_id=$1 AND reason='sell_common'",
        [u.userId],
      )
    ).rowCount,
    1,
  );
});
test("Changed/expired Common quotes and frozen accounts cannot sell; new items are not silently included", async () => {
  const u = await user(806);
  const a = await common(u.userId);
  let quote = (await req(u.token, "/collection/common/preview", {})).body.data;
  await db.query("UPDATE domains SET favorite=true WHERE id=$1", [a]);
  assert.equal(
    (await req(u.token, "/collection/common/sell", { id: quote.id })).status,
    409,
  );
  await db.query("UPDATE domains SET favorite=false WHERE id=$1", [a]);
  quote = (await req(u.token, "/collection/common/preview", {})).body.data;
  await db.query(
    "UPDATE common_sale_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",
    [quote.id],
  );
  assert.equal(
    (await req(u.token, "/collection/common/sell", { id: quote.id })).status,
    409,
  );
  quote = (await req(u.token, "/collection/common/preview", {})).body.data;
  const added = await common(u.userId);
  await db.query("UPDATE users SET frozen=true WHERE id=$1", [u.userId]);
  assert.equal(
    (await req(u.token, "/collection/common/sell", { id: quote.id })).status,
    403,
  );
  await db.query("UPDATE users SET frozen=false WHERE id=$1", [u.userId]);
  assert.equal(
    (await req(u.token, "/collection/common/sell", { id: quote.id })).status,
    200,
  );
  assert.equal(
    (await db.query("SELECT status FROM domains WHERE id=$1", [added])).rows[0]
      .status,
    "kept",
  );
});
test("Favorite TLD and Recent Drops come from personal historical results, including sold and rerolled drops", async () => {
  const u = await user(807);
  const zones = ["ua", "ua", "xyz"];
  let index = 0;
  for (const tld of zones) {
    await db.transaction(async (c) => {
      const id = await game.insertDomain(
        c,
        u.userId,
        evaluate(
          "project" + index++,
          defaultConfig.tlds.find((t) => t.name === tld)!,
          defaultConfig,
        ),
        "sold",
        "spin",
        "random",
      );
      await c.query(
        "INSERT INTO spins(id,user_id,domain_id,kind,cost,pity_before) VALUES($1,$2,$3,'spin',750,0)",
        [randomUUID(), u.userId, id],
      );
    });
  }
  await db.transaction(async (c) => {
    const id = await game.insertDomain(
      c,
      u.userId,
      evaluate(
        "project99",
        defaultConfig.tlds.find((t) => t.name === "xyz")!,
        defaultConfig,
      ),
      "destroyed",
      "reroll",
    );
    await c.query(
      "INSERT INTO spins(id,user_id,domain_id,kind,cost,pity_before) VALUES($1,$2,$3,'reroll',0,0)",
      [randomUUID(), u.userId, id],
    );
  });
  const state = (await req(u.token, "/state")).body;
  assert.equal(state.profile.favorite_tld, "ua");
  assert.equal(state.profile.favorite_tld_count, 2);
  const rows = (await req(u.token, "/recent-drops")).body;
  assert.equal(rows.length, 4);
  assert.ok(rows.some((d: any) => d.status === "sold"));
  assert.ok(rows.some((d: any) => d.status === "destroyed"));
  assert.ok(rows.every((d: any) => d.owner_id === undefined));
  const v = await user(808);
  assert.equal((await req(v.token, "/recent-drops")).body.length, 0);
});
