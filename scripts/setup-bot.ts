import "dotenv/config";
const { BOT_TOKEN, APP_URL, WEBHOOK_SECRET } = process.env;
if (!BOT_TOKEN || !APP_URL?.startsWith("https://") || !WEBHOOK_SECRET)
  throw new Error(
    "Set BOT_TOKEN, HTTPS APP_URL and WEBHOOK_SECRET in server environment",
  );
async function call(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await r.json()) as { ok: boolean };
  if (!result.ok) throw new Error(`Telegram ${method} failed`);
  console.log(`${method}: OK`);
}
await call("setWebhook", {
  url: APP_URL + "/api/telegram/webhook",
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ["message"],
});
await call("setChatMenuButton", {
  menu_button: { type: "web_app", text: "Играть", web_app: { url: APP_URL } },
});
await call("setMyCommands", {
  commands: [
    { command: "start", description: "Открыть DOMAIN DROP" },
    { command: "help", description: "Как играть" },
    { command: "support", description: "Поддержка" },
  ],
});
