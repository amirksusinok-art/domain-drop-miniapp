type BotConfig = {
  token: string;
  username: string;
  appUrl: string;
  webhookSecret: string;
};
let status: "disabled" | "pending" | "ready" | "failed" = "disabled";
export const botSetupStatus = () => status;

export async function configureBot(
  config: BotConfig,
  request: typeof fetch = fetch,
) {
  async function call(method: string, body: unknown = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let result: any;
      try {
        const response = await request(
          `https://api.telegram.org/bot${config.token}/${method}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          },
        );
        result = await response.json();
      } catch {
        throw new Error(`Telegram ${method} unavailable`);
      }
      if (result.ok) return result.result;
      if (result.error_code === 429 && attempt < 2) {
        const wait = Math.min(
          120,
          Math.max(1, Number(result.parameters?.retry_after) || 10),
        );
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        continue;
      }
      throw new Error(`Telegram ${method} rejected`);
    }
  }
  const bot = await call("getMe");
  if (
    bot.username?.toLowerCase() !==
    config.username.replace(/^@/, "").toLowerCase()
  )
    throw new Error("Telegram bot identity mismatch");
  await call("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Играть",
      web_app: { url: config.appUrl },
    },
  });
  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть DOMAIN DROP" },
      { command: "help", description: "Как играть" },
      { command: "support", description: "Поддержка" },
    ],
  });
  await call("setWebhook", {
    url: config.appUrl + "/api/telegram/webhook",
    secret_token: config.webhookSecret,
    allowed_updates: ["message"],
  });
  const webhook = await call("getWebhookInfo");
  if (webhook.url !== config.appUrl + "/api/telegram/webhook")
    throw new Error("Telegram webhook verification failed");
  return { username: bot.username };
}
export function startBotSetup() {
  if (process.env.BOT_AUTO_SETUP !== "true") return;
  const { BOT_TOKEN, BOT_USERNAME, APP_URL, WEBHOOK_SECRET } = process.env;
  if (!BOT_TOKEN || !BOT_USERNAME || !APP_URL || !WEBHOOK_SECRET) {
    status = "failed";
    console.error("Telegram setup missing server configuration");
    return;
  }
  status = "pending";
  void configureBot({
    token: BOT_TOKEN,
    username: BOT_USERNAME,
    appUrl: APP_URL,
    webhookSecret: WEBHOOK_SECRET,
  })
    .then(() => {
      status = "ready";
      console.log("Telegram bot menu and webhook verified");
    })
    .catch(() => {
      status = "failed";
      console.error(
        "Telegram setup failed; check server configuration and Telegram availability",
      );
    });
}
