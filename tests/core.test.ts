import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { database, type Database } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import { createApp } from "../server/app.js";
import { verifyTelegram, login } from "../server/auth.js";
import {
  defaultConfig,
  evaluate,
  generate,
  catalog,
} from "../server/economy.js";
import * as game from "../server/game.js";
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
async function user(id: number) {
  return login(db, { id, first_name: "Test " + id, username: "test" + id });
}
async function request(
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
async function ready(id: string) {
  await db.query(
    "UPDATE users SET last_spin_at=now()-interval '2 seconds' WHERE id=$1",
    [id],
  );
}
test("Telegram HMAC validates identity, rejects forgery and stale timestamps", () => {
  const token = "test:secret",
    params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42, first_name: "Alice" }),
      query_id: "abc",
    });
  const payload = [...params]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set(
    "hash",
    createHmac("sha256", secret).update(payload).digest("hex"),
  );
  assert.equal(verifyTelegram(params.toString(), token).id, 42);
  assert.throws(() =>
    verifyTelegram(params.toString(), token, Date.now() + 7200000),
  );
  params.set("user", JSON.stringify({ id: 43, first_name: "Mallory" }));
  assert.throws(() => verifyTelegram(params.toString(), token));
  assert.throws(() => verifyTelegram(params.toString() + "&hash=abc", token));
});
test("TLD does not determine rarity alone; pity forces Rare+ and snapshots are meaningful", () => {
  const ai = defaultConfig.tlds.find((t) => t.name === "ai")!,
    com = defaultConfig.tlds.find((t) => t.name === "com")!,
    xyz = defaultConfig.tlds.find((t) => t.name === "xyz")!;
  assert.equal(evaluate("777", ai, defaultConfig).rarity, "LEGENDARY");
  assert.equal(evaluate("777", com, defaultConfig).rarity, "MYTHIC");
  assert.notEqual(evaluate("random928", com, defaultConfig).rarity, "MYTHIC");
  assert.equal(evaluate("777", xyz, defaultConfig).rarity, "RARE");
  const pool = catalog(defaultConfig);
  for (let i = 0; i < 100; i++)
    assert.ok(
      ["RARE", "EPIC", "LEGENDARY", "MYTHIC"].includes(
        generate(defaultConfig, 29, undefined, undefined, pool).rarity,
      ),
    );
});
test("Concurrent login gives one welcome balance, and client economy fields are rejected", async () => {
  const results = await Promise.all([user(101), user(101)]);
  assert.equal(results[0].userId, results[1].userId);
  const ledger = await db.query(
    "SELECT * FROM transactions WHERE user_id=$1 AND reason='welcome'",
    [results[0].userId],
  );
  assert.equal(ledger.rows.length, 1);
  const response = await request(results[0].token, "/spin", {
    coins: 999999,
    value: 900000,
  });
  assert.equal(response.status, 400);
});
test("Idempotent spin survives retry; competing spins cannot debit twice; immutable snapshot; double-sell rejected", async () => {
  const u = await user(102),
    key = randomUUID();
  const responses = await Promise.all([
    request(u.token, "/spin", { tld: "xyz" }, key),
    request(u.token, "/spin", { tld: "xyz" }, key),
  ]);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[1].status, 200);
  assert.equal(
    responses[0].body.state.pending.id,
    responses[1].body.state.pending.id,
  );
  const d = responses[0].body.state.pending;
  assert.equal(responses[0].body.state.profile.coins, 10000);
  assert.equal((await request(u.token, "/daily", {}, key)).status, 409);
  await assert.rejects(
    db.query("UPDATE domains SET value=value+1 WHERE id=$1", [d.id]),
  );
  await ready(u.userId);
  assert.equal((await request(u.token, "/spin", { tld: "xyz" })).status, 409);
  const sales = await Promise.all([
    request(u.token, "/domain", { id: d.id, action: "sell" }),
    request(u.token, "/domain", { id: d.id, action: "sell" }),
  ]);
  assert.deepEqual(sales.map((r) => r.status).sort(), [200, 409]);
  const s = (await request(u.token, "/state")).body;
  assert.equal(s.profile.coins, 10000 + d.value);
  await ready(u.userId);
  const spins = await Promise.all([
    request(u.token, "/spin", { tld: "xyz" }),
    request(u.token, "/spin", { tld: "xyz" }),
  ]);
  assert.deepEqual(spins.map((r) => r.status).sort(), [200, 429]);
  const balance = (await request(u.token, "/state")).body.profile.coins;
  assert.equal(balance, 10000 + d.value - 100);
});
test("Daily rewards and rerolls are atomic and UTC reset restores availability", async () => {
  const u = await user(103);
  const daily = await Promise.all([
    request(u.token, "/daily", {}),
    request(u.token, "/daily", {}),
  ]);
  assert.deepEqual(daily.map((r) => r.status).sort(), [200, 409]);
  const spin = await request(u.token, "/spin", { tld: "xyz" });
  const old = spin.body.state.pending.id;
  await ready(u.userId);
  const reroll = await request(u.token, "/reroll", {});
  assert.equal(reroll.status, 200);
  assert.notEqual(old, reroll.body.state.pending.id);
  assert.equal(reroll.body.state.profile.coins, 11000);
  assert.equal(
    (await db.query("SELECT status FROM domains WHERE id=$1", [old])).rows[0]
      .status,
    "destroyed",
  );
  await ready(u.userId);
  assert.equal((await request(u.token, "/reroll", {})).status, 409);
  await db.query(
    "UPDATE users SET reroll_date=(now() AT TIME ZONE 'UTC')::date-1,daily_claim_date=(now() AT TIME ZONE 'UTC')::date-1 WHERE id=$1",
    [u.userId],
  );
  assert.equal(
    (await request(u.token, "/state")).body.profile.reroll_available,
    true,
  );
  assert.equal((await request(u.token, "/daily", {})).status, 200);
});
test("Authorization, favorites and vault protect domains", async () => {
  const u = await user(104),
    other = await user(105);
  const d = (await request(u.token, "/spin", { tld: "xyz" })).body.state
    .pending;
  assert.equal(
    (await request(other.token, "/domain", { id: d.id, action: "sell" }))
      .status,
    404,
  );
  assert.equal((await request(other.token, "/admin")).status, 403);
  await request(u.token, "/domain", { id: d.id, action: "keep" });
  await request(u.token, "/domain", { id: d.id, action: "favorite" });
  assert.equal(
    (await request(u.token, "/domain", { id: d.id, action: "sell" })).status,
    409,
  );
  await request(u.token, "/domain", { id: d.id, action: "favorite" });
  await request(u.token, "/domain", { id: d.id, action: "vault" });
  assert.equal(
    (await request(u.token, "/domain", { id: d.id, action: "sell" })).status,
    409,
  );
  const collection = await request(u.token, "/collection?filter=vault");
  assert.equal(collection.body.items.length, 1);
});
test("Scanner never leaks hidden cards before selection and awards only one", async () => {
  const u = await user(106);
  const opened = await request(u.token, "/scanner/open", {});
  assert.equal(opened.status, 200);
  assert.equal(opened.body.data.cards, undefined);
  assert.equal(opened.body.state.scanner.cards, undefined);
  assert.equal((await request(u.token, "/spin", { tld: "xyz" })).status, 409);
  const id = opened.body.data.id;
  const picks = await Promise.all([
    request(u.token, "/scanner/pick", { id, index: 0 }),
    request(u.token, "/scanner/pick", { id, index: 1 }),
  ]);
  assert.deepEqual(picks.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await db.query("SELECT * FROM domains WHERE owner_id=$1", [u.userId]))
      .rowCount,
    1,
  );
});
test("Auction escrow refunds outbid player and settles exactly once", async () => {
  await game.scheduler(db);
  const a = (await db.query("SELECT * FROM auctions WHERE status='active'"))
    .rows[0];
  const u = await user(107),
    v = await user(108);
  await db.transaction(async (c) => {
    await game.credit(c, u.userId, 100000, "test");
    await game.credit(c, v.userId, 100000, "test");
  });
  const initial = Number(a.start_price);
  assert.equal(
    (await request(u.token, "/auction/bid", { id: a.id, amount: initial }))
      .status,
    200,
  );
  const amount = initial + Math.max(100, Math.ceil(initial * 0.05));
  assert.equal(
    (await request(v.token, "/auction/bid", { id: a.id, amount })).status,
    200,
  );
  assert.equal((await request(u.token, "/state")).body.profile.coins, 110000);
  assert.equal(
    (await request(v.token, "/state")).body.profile.coins,
    110000 - amount,
  );
  await db.query(
    "UPDATE auctions SET ends_at=now()-interval '1 second' WHERE id=$1",
    [a.id],
  );
  await game.scheduler(db);
  await game.scheduler(db);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM domains WHERE owner_id=$1 AND source='auction'",
        [v.userId],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await request(u.token, "/auction/bid", {
        id: a.id,
        amount: amount + 1000,
      })
    ).status,
    409,
  );
});
test("Quest claims cannot be replayed, and ledger reconciles balances", async () => {
  const u = await user(109);
  await db.transaction((c) => game.progress(c, u.userId, "spin", 10));
  const results = await Promise.all([
    request(u.token, "/quest", { id: "spin" }),
    request(u.token, "/quest", { id: "spin" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const rows = (
    await db.query(
      "SELECT u.id,u.coins,COALESCE(sum(t.amount),0) AS total FROM users u LEFT JOIN transactions t ON t.user_id=u.id GROUP BY u.id",
    )
  ).rows;
  for (const row of rows) assert.equal(Number(row.coins), Number(row.total));
});
test("Selected zone controls the drop and paid price; unknown zones and client prices are rejected", async () => {
  const u = await user(110);
  assert.equal(
    (await request(u.token, "/spin", { tld: "notreal" })).status,
    400,
  );
  assert.equal(
    (await request(u.token, "/spin", { tld: "com", price: 1 })).status,
    400,
  );
  const first = await request(u.token, "/spin", { tld: "ua" });
  assert.equal(first.status, 200);
  assert.equal(first.body.state.pending.tld, "ua");
  assert.equal(first.body.state.profile.coins, 10000);
  await request(u.token, "/domain", {
    id: first.body.state.pending.id,
    action: "keep",
  });
  await ready(u.userId);
  const paid = await request(u.token, "/spin", { tld: "com" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.state.pending.tld, "com");
  assert.equal(paid.body.state.profile.coins, 7750);
  await ready(u.userId);
  assert.equal((await request(u.token, "/reroll", { tld: "ua" })).status, 400);
  const rerolled = await request(u.token, "/reroll", {});
  assert.equal(rerolled.status, 200);
  assert.equal(rerolled.body.state.pending.tld, "com");
  assert.equal(rerolled.body.state.profile.coins, 7750);
});
test("Pity cannot be transferred from cheap zones to premium zones", async () => {
  const u = await user(111);
  await db.query(
    "INSERT INTO zone_pity(user_id,tld,counter) VALUES($1,'xyz',29)",
    [u.userId],
  );
  const stateBefore = (await request(u.token, "/state")).body;
  assert.equal(
    stateBefore.config.zones.find((z: any) => z.name === "xyz").rareChance,
    1,
  );
  assert.ok(
    stateBefore.config.zones.find((z: any) => z.name === "com").rareChance <
      0.1,
  );
  const premium = await request(u.token, "/spin", { tld: "com" });
  assert.equal(premium.status, 200);
  assert.equal(
    (
      await db.query(
        "SELECT counter FROM zone_pity WHERE user_id=$1 AND tld='xyz'",
        [u.userId],
      )
    ).rows[0].counter,
    29,
  );
});
test("RANDOM mode, its price and reroll behavior survive persisted results", async () => {
  const u = await user(112);
  const first = await request(u.token, "/spin", { tld: "random" });
  assert.equal(first.status, 200);
  assert.equal(first.body.state.pending.spin_mode, "random");
  assert.notEqual(first.body.state.pending.tld, "random");
  const restored = (await request(u.token, "/state")).body;
  assert.equal(restored.pending.spin_mode, "random");
  await request(u.token, "/domain", {
    id: restored.pending.id,
    action: "keep",
  });
  await ready(u.userId);
  const paid = await request(u.token, "/spin", { tld: "random" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.state.profile.coins, 9500);
  assert.equal(paid.body.state.pending.spin_mode, "random");
  await assert.rejects(
    db.query("UPDATE domains SET spin_mode='com' WHERE id=$1", [
      paid.body.state.pending.id,
    ]),
  );
  await ready(u.userId);
  const rerolled = await request(u.token, "/reroll", {});
  assert.equal(rerolled.status, 200);
  assert.equal(rerolled.body.state.pending.spin_mode, "random");
  assert.equal(rerolled.body.state.profile.coins, 9500);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::integer AS n FROM zone_pity WHERE user_id=$1 AND tld<>$2",
        [u.userId, "random"],
      )
    ).rows[0].n,
    0,
  );
});
