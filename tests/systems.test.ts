import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { database, type Database } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import { login } from "../server/auth.js";
import { createApp } from "../server/app.js";
import * as game from "../server/game.js";
import * as sys from "../server/systems.js";
import { defaultConfig, evaluate } from "../server/economy.js";
let db: Database, server: Server, base: string;
before(async () => {
  db = await database(process.env.TEST_DATABASE_URL, true);
  await migrate(db);
  process.env.ADMIN_TELEGRAM_IDS = "901";
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});
const user = (id: number) =>
  login(db, { id, first_name: "Player", username: "p" + id });
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
const drop = (name = "777", tld = "ai") =>
  evaluate(
    name,
    defaultConfig.tlds.find((t) => t.name === tld)!,
    defaultConfig,
  );
test("New players receive configurable balance once; existing players and welcome acknowledgement survive repeat login", async () => {
  const a = await user(902);
  let st = (await req(a.token, "/state")).body;
  assert.equal(st.profile.coins, 50000);
  assert.equal(st.welcome, 50000);
  await req(a.token, "/welcome/ack", {});
  const admin = await user(901);
  const cfg = (await req(admin.token, "/admin/dashboard")).body.config;
  assert.equal(
    (
      await req(admin.token, "/admin/config", {
        config: { ...cfg, startingBalance: 75000 },
        reason: "Testing new welcome amount",
      })
    ).status,
    200,
  );
  const again = await user(902);
  st = (await req(again.token, "/state")).body;
  assert.equal(st.profile.coins, 50000);
  assert.equal(st.welcome, null);
  const b = await user(903);
  assert.equal((await req(b.token, "/state")).body.welcome, 75000);
  await req(admin.token, "/admin/config", {
    config: cfg,
    reason: "Restore initial welcome amount",
  });
});
test("Admin permission is enforced across all administrative routes; balance edits require reason and are idempotent", async () => {
  const a = await user(904),
    admin = await user(901);
  assert.equal((await req(a.token, "/admin/dashboard")).status, 403);
  assert.equal((await req(a.token, "/admin/player/" + a.userId)).status, 403);
  assert.equal((await req(a.token, "/admin/promo/create", {})).status, 403);
  assert.equal(
    (
      await req(admin.token, "/admin/player/update", {
        id: a.userId,
        action: "coins",
        amount: 100,
      })
    ).status,
    400,
  );
  const key = randomUUID(),
    body = {
      id: a.userId,
      action: "coins",
      amount: 1000,
      reason: "Compensation test",
    };
  const results = await Promise.all([
    req(admin.token, "/admin/player/update", body, key),
    req(admin.token, "/admin/player/update", body, key),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await req(a.token, "/state")).body.profile.coins, 51000);
  assert.equal(
    (
      await req(admin.token, "/admin/player/update", {
        ...body,
        amount: -100000,
      })
    ).status,
    409,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM admin_audit WHERE action='player_coins' AND detail->>'target'=$1",
          [a.userId],
        )
      ).rows[0].n,
    ),
    1,
  );
});
test("Promos start empty, enforce dates, user/global limits and concurrent redemption without duplicate rewards", async () => {
  const admin = await user(901),
    a = await user(905),
    b = await user(906);
  assert.equal((await req(admin.token, "/admin/promos")).body.length, 0);
  const body = {
    code: "TEST-" + randomUUID().slice(0, 8).toUpperCase(),
    rewardType: "coins",
    rewardValue: 2000,
    cosmetic: null,
    totalLimit: 1,
    userLimit: 1,
    startsAt: new Date(Date.now() - 10000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    enabled: true,
  };
  assert.equal(
    (await req(admin.token, "/admin/promo/create", body)).status,
    200,
  );
  const results = await Promise.all([
    req(a.token, "/promo/redeem", { code: body.code }),
    req(a.token, "/promo/redeem", { code: body.code }),
    req(b.token, "/promo/redeem", { code: body.code }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const sum = Number(
    (
      await db.query(
        "SELECT sum(coins) AS n FROM users WHERE id=ANY($1::uuid[])",
        [[a.userId, b.userId]],
      )
    ).rows[0].n,
  );
  assert.equal(sum, 102000);
  assert.equal(
    Number(
      (await db.query("SELECT count(*) AS n FROM promo_redemptions")).rows[0].n,
    ),
    1,
  );
  const multi = {
    ...body,
    code: body.code + "M",
    rewardType: "reroll",
    rewardValue: 1,
    totalLimit: 5,
    userLimit: 2,
  };
  await req(admin.token, "/admin/promo/create", multi);
  assert.equal(
    (await req(a.token, "/promo/redeem", { code: multi.code })).status,
    200,
  );
  assert.equal(
    (await req(a.token, "/promo/redeem", { code: multi.code })).status,
    200,
  );
  assert.equal(
    (await req(a.token, "/promo/redeem", { code: multi.code })).status,
    409,
  );
  const future = {
    ...body,
    code: body.code + "F",
    startsAt: new Date(Date.now() + 30000).toISOString(),
  };
  await req(admin.token, "/admin/promo/create", future);
  assert.equal(
    (await req(a.token, "/promo/redeem", { code: future.code })).status,
    409,
  );
});
test("Serial numbers are globally atomic and immutable, admin-created domains excluded from records", async () => {
  const a = await user(907),
    b = await user(908);
  const ids = await Promise.all(
    [a, b, a, b].map((u) =>
      db.transaction((c) =>
        game.insertDomain(c, u.userId, drop(), "kept", "spin"),
      ),
    ),
  );
  const rows = (
    await db.query(
      "SELECT serial,discovery FROM domains WHERE id=ANY($1::uuid[]) ORDER BY serial",
      [ids],
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => Number(r.serial)),
    [1, 2, 3, 4],
  );
  assert.equal(rows.filter((r) => r.discovery.firstFound).length, 1);
  await assert.rejects(
    db.query("UPDATE domains SET serial=999 WHERE id=$1", [ids[0]]),
  );
  const artificial = await db.transaction((c) =>
    game.insertDomain(c, a.userId, drop("777", "com"), "kept", "auction"),
  );
  assert.equal(
    (await db.query("SELECT serial FROM domains WHERE id=$1", [artificial]))
      .rows[0].serial,
    null,
  );
  const records = await sys.records(db);
  assert.notEqual(records.all?.id, artificial);
  await db.query("UPDATE domains SET status='sold' WHERE id=$1", [ids[0]]);
  assert.equal((await sys.records(db)).all?.id, ids[0]);
});
test("Quick Sell upgrades debit once, rules intersect, protected drops stay, selected scanner card is sold atomically", async () => {
  const a = await user(909);
  const key = randomUUID();
  const upgrades = await Promise.all([
    req(a.token, "/quick/upgrade", {}, key),
    req(a.token, "/quick/upgrade", {}, key),
  ]);
  assert.ok(upgrades.every((r) => r.status === 200));
  let st = (await req(a.token, "/state")).body;
  assert.equal(st.quickSell.level, 1);
  assert.equal(st.profile.coins, 49000);
  let rules = { ...st.quickSell.rules, enabled: true };
  assert.equal((await req(a.token, "/quick/settings", rules)).status, 200);
  const ordinary = drop("ordinary928", "xyz");
  assert.equal(ordinary.rarity, "COMMON");
  const protectedDrop = { ...ordinary, tags: ["TRIPLE"] };
  const u = (await db.query("SELECT * FROM users WHERE id=$1", [a.userId]))
    .rows[0];
  assert.ok(
    sys.matchesQuick(u, { ...ordinary, serial: null }, sys.systemDefaults),
  );
  assert.equal(
    sys.matchesQuick(u, { ...ordinary, serial: 1 }, sys.systemDefaults),
    false,
  );
  assert.equal(sys.matchesQuick(u, protectedDrop, sys.systemDefaults), false);
  assert.equal(
    sys.matchesQuick(u, { ...ordinary, rarity: "RARE" }, sys.systemDefaults),
    false,
  );
  const open = await req(a.token, "/scanner/open", {});
  await db.query("UPDATE scanner_sessions SET cards=$2 WHERE id=$1", [
    open.body.data.id,
    JSON.stringify([ordinary, ordinary, ordinary]),
  ]);
  const pick = await req(a.token, "/scanner/pick", {
    id: open.body.data.id,
    index: 0,
  });
  assert.equal(pick.status, 200);
  assert.equal(pick.body.state.pending.quick_sold, true);
  assert.equal(pick.body.state.pending.status, "sold");
  assert.equal(pick.body.state.profile.coins, 49000 + ordinary.value);
  await db.query(
    "UPDATE users SET last_spin_at=now()-interval '2 seconds' WHERE id=$1",
    [a.userId],
  );
  assert.equal((await req(a.token, "/reroll", {})).status, 409);
  const id = pick.body.state.pending.id;
  assert.equal(
    (await req(a.token, "/domain", { id, action: "sell" })).status,
    409,
  );
  assert.equal((await req(a.token, "/state")).body.pending.id, id);
  await req(a.token, "/drop/ack", { id });
  assert.equal((await req(a.token, "/state")).body.pending, null);
  const level5 = {
    ...u,
    quick_level: 5,
    quick_rules: { ...rules, below: ordinary.value + 1, tlds: ["xyz"] },
  };
  assert.equal(sys.matchesQuick(level5, ordinary, sys.systemDefaults), true);
  assert.equal(
    sys.matchesQuick(
      {
        ...level5,
        quick_rules: { ...level5.quick_rules, below: ordinary.value },
      },
      ordinary,
      sys.systemDefaults,
    ),
    false,
  );
  assert.equal(
    sys.matchesQuick(
      { ...level5, quick_rules: { ...level5.quick_rules, tlds: ["com"] } },
      ordinary,
      sys.systemDefaults,
    ),
    false,
  );
});
test("Freeze blocks new economic actions but auction refunds and settlement still execute; ban and feature switches are enforced", async () => {
  const admin = await user(901),
    a = await user(910),
    b = await user(911);
  const auction = randomUUID();
  await db.query(
    "INSERT INTO auctions(id,domain,ends_at,start_price) VALUES($1,$2,now()+interval '1 hour',1000)",
    [auction, JSON.stringify(drop())],
  );
  assert.equal(
    (await req(a.token, "/auction/bid", { id: auction, amount: 1000 })).status,
    200,
  );
  assert.equal(
    (
      await req(admin.token, "/admin/player/update", {
        id: a.userId,
        action: "freeze",
        reason: "Review suspicious activity",
      })
    ).status,
    200,
  );
  assert.equal((await req(a.token, "/spin", { tld: "xyz" })).status, 403);
  assert.equal((await req(a.token, "/daily", {})).status, 403);
  assert.equal((await req(a.token, "/state")).status, 200);
  assert.equal(
    (await req(b.token, "/auction/bid", { id: auction, amount: 1100 })).status,
    200,
  );
  assert.equal((await req(a.token, "/state")).body.profile.coins, 50000);
  await req(admin.token, "/admin/player/update", {
    id: b.userId,
    action: "freeze",
    reason: "Review second account",
  });
  await db.query(
    "UPDATE auctions SET ends_at=now()-interval '1 minute' WHERE id=$1",
    [auction],
  );
  await game.scheduler(db);
  assert.ok(
    (await db.query("SELECT domain_id FROM auctions WHERE id=$1", [auction]))
      .rows[0].domain_id,
  );
  await req(admin.token, "/admin/player/update", {
    id: a.userId,
    action: "ban",
    reason: "Temporary investigation",
    until: new Date(Date.now() + 60000).toISOString(),
  });
  assert.equal((await req(a.token, "/state")).status, 403);
  await req(admin.token, "/admin/player/update", {
    id: a.userId,
    action: "unban",
    reason: "Investigation complete",
  });
  assert.equal((await req(a.token, "/state")).status, 200);
  const settings = (await req(admin.token, "/admin/dashboard")).body.systems;
  await req(admin.token, "/admin/systems", {
    config: { ...settings, flags: { ...settings.flags, scanner: false } },
    reason: "Test isolated feature switch",
  });
  const c = await user(912);
  assert.equal((await req(c.token, "/scanner/open", {})).status, 503);
  assert.equal((await req(c.token, "/daily", {})).status, 200);
  await req(admin.token, "/admin/systems", {
    config: settings,
    reason: "Restore scanner feature",
  });
});
test("Cosmetic promo unlocks an existing theme without changing level or economy", async () => {
  const a = await user(913),
    admin = await user(901);
  const body = {
    code: "COSMETIC-" + randomUUID().slice(0, 8).toUpperCase(),
    rewardType: "cosmetic",
    rewardValue: 1,
    cosmetic: "GOLD",
    totalLimit: 10,
    userLimit: 1,
    startsAt: new Date(Date.now() - 10000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    enabled: true,
  };
  await req(admin.token, "/admin/promo/create", body);
  assert.equal(
    (await req(a.token, "/promo/redeem", { code: body.code })).status,
    200,
  );
  assert.equal((await req(a.token, "/theme", { theme: "GOLD" })).status, 200);
  assert.equal((await req(a.token, "/state")).body.profile.level, 1);
});

test("Maintenance keeps owner access, full ledger pagination works and audit history identifies its actor", async () => {
  const admin = await user(901),
    a = await user(914);
  const cfg = (await req(admin.token, "/admin/dashboard")).body.config;
  const maintenance = await req(admin.token, "/admin/config", {
    config: { ...cfg, maintenance: true },
    reason: "Planned maintenance test",
  });
  assert.equal(maintenance.status, 200);
  assert.equal((await req(a.token, "/state")).status, 503);
  assert.equal((await req(admin.token, "/admin/dashboard")).status, 200);
  assert.equal(
    (
      await req(admin.token, "/admin/config", {
        config: cfg,
        reason: "End planned maintenance",
      })
    ).status,
    200,
  );
  const history = (await req(a.token, "/history?page=0")).body;
  assert.equal(Number(history[0].balance_before), 0);
  assert.equal(Number(history[0].balance_after), 50000);
  assert.equal((await req(a.token, "/history?page=1")).body.length, 0);
  const audit = (await req(admin.token, "/admin/audit?page=0")).body;
  assert.ok(audit.length > 0);
  assert.equal(audit[0].admin_telegram_id, "901");
});

test("Migration re-entry preserves serial registry, immutable attributes and configured welcome amount", async () => {
  const admin = await user(901),
    cfg = (await req(admin.token, "/admin/dashboard")).body.config;
  await req(admin.token, "/admin/config", {
    config: { ...cfg, startingBalance: 60000 },
    reason: "Migration persistence test",
  });
  const before = (
    await db.query(
      "SELECT name,tld,last_number FROM domain_serial_counters ORDER BY name,tld",
    )
  ).rows;
  await migrate(db);
  assert.deepEqual(
    (
      await db.query(
        "SELECT name,tld,last_number FROM domain_serial_counters ORDER BY name,tld",
      )
    ).rows,
    before,
  );
  assert.equal((await game.configFor(db)).startingBalance, 60000);
  const d = (
    await db.query("SELECT id FROM domains WHERE serial IS NOT NULL LIMIT 1")
  ).rows[0];
  await assert.rejects(
    db.query("UPDATE domains SET serial=999 WHERE id=$1", [d.id]),
  );
  await req(admin.token, "/admin/config", {
    config: cfg,
    reason: "Restore balance after migration test",
  });
});

test("Lowering Quick Sell capability cannot silently broaden saved filters", () => {
  const ordinary = drop("ordinary928", "xyz");
  const u = {
    quick_level: 5,
    quick_rules: {
      enabled: true,
      rarities: ["COMMON"],
      below: ordinary.value,
      tlds: ["xyz"],
      keepTags: [],
      favoriteTld: null,
    },
  };
  assert.equal(
    sys.matchesQuick(u, ordinary, { ...sys.systemDefaults, quickMaxLevel: 1 }),
    false,
  );
});

test("Administrator access cannot be accidentally removed by an in-game ban", async () => {
  const admin = await user(901);
  const response = await req(admin.token, "/admin/player/update", {
    id: admin.userId,
    action: "ban",
    reason: "Owner lockout protection test",
  });
  assert.equal(response.status, 409);
  assert.equal((await req(admin.token, "/state")).status, 200);
});
