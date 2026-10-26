import { database } from "../server/db.js";
import { migrate } from "../server/migrate.js";
const db = await database();
try {
  await migrate(db);
  console.log("Database migration complete");
} finally {
  await db.close();
}
