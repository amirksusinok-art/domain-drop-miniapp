import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.js";
import type { Config } from "./economy.js";
export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const telegramUser = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  first_name: z.string().max(128),
  username: z.string().max(64).optional(),
});
export function verifyTelegram(
  initData: string,
  botToken: string,
  now = Date.now(),
) {
  const params = new URLSearchParams(initData);
  if ([...params.keys()].length !== new Set(params.keys()).size)
    throw new GameError(401, "Повторяющиеся поля авторизации");
  const hash = params.get("hash");
  params.delete("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash))
    throw new GameError(401, "Некорректная подпись Telegram");
  const data = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new GameError(401, "Не удалось подтвердить вход через Telegram");
  const authDate = Number(params.get("auth_date"));
  const age = now / 1000 - authDate;
  if (!Number.isFinite(authDate) || age > 3600 || age < -30)
    throw new GameError(401, "Сессия запуска устарела. Откройте игру заново");
  try {
    return telegramUser.parse(JSON.parse(params.get("user") ?? ""));
  } catch {
    throw new GameError(401, "Некорректный пользователь Telegram");
  }
}
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function login(db: Database, user: z.infer<typeof telegramUser>) {
  return db.transaction(async (c) => {
    const config = (
      await c.query<{ config: Config }>(
        "SELECT config FROM settings WHERE id=1",
      )
    ).rows[0].config;
    const id = randomUUID();
    const inserted = await c.query(
      "INSERT INTO users(id,telegram_id,username,first_name,coins,welcome_ack,welcome_amount) VALUES($1,$2,$3,$4,$5::bigint,false,$5::bigint) ON CONFLICT(telegram_id) DO NOTHING RETURNING id",
      [
        id,
        String(user.id),
        user.username ?? "",
        user.first_name,
        config.startingBalance,
      ],
    );
    if (inserted.rowCount)
      await c.query(
        "INSERT INTO transactions(id,user_id,amount,balance_after,reason) VALUES($1,$2,$3,$3,$4)",
        [randomUUID(), id, config.startingBalance, "starting_balance"],
      );
    const actual = (
      await c.query(
        "UPDATE users SET username=$2,first_name=$3,last_seen_at=now() WHERE telegram_id=$1 RETURNING id",
        [String(user.id), user.username ?? "", user.first_name],
      )
    ).rows[0].id;
    const token = randomBytes(32).toString("hex");
    await c.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hashToken(token), actual],
    );
    return { token, userId: actual };
  });
}
