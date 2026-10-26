import "dotenv/config";
import { database } from "./db.js";
import { migrate } from "./migrate.js";
import { createApp } from "./app.js";
import { scheduler } from "./game.js";
const db = await database();
await migrate(db);
await scheduler(db);
const app = createApp(db);
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, "0.0.0.0", () =>
  console.log(
    `DOMAIN DROP listening on port ${port} (${db.embedded ? "local PostgreSQL" : "PostgreSQL"})`,
  ),
);
let ticking = false;
const timer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await scheduler(db);
  } catch {
    console.error("Scheduler pass failed; retrying next minute");
  } finally {
    ticking = false;
  }
}, 30000);
async function shutdown() {
  clearInterval(timer);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
