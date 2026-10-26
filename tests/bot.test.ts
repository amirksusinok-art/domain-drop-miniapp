import { test } from "node:test";
import assert from "node:assert/strict";
import { configureBot } from "../server/bot.js";
const config = {
  token: "test-token",
  username: "example_bot",
  appUrl: "https://game.example",
  webhookSecret: "test-webhook-secret",
};
test("Bot setup verifies identity before configuring the Mini App menu and webhook", async () => {
  const calls: { method: string; body: any }[] = [];
  const fake = async (url: any, options: any) => {
    const method = String(url).split("/").at(-1)!;
    calls.push({ method, body: JSON.parse(options.body) });
    return new Response(
      JSON.stringify({
        ok: true,
        result:
          method === "getMe"
            ? { username: "example_bot" }
            : method === "getWebhookInfo"
              ? { url: config.appUrl + "/api/telegram/webhook" }
              : true,
      }),
    );
  };
  assert.equal(
    (await configureBot(config, fake as typeof fetch)).username,
    "example_bot",
  );
  assert.equal(calls[0].method, "getMe");
  assert.equal(
    calls.find((c) => c.method === "setChatMenuButton")!.body.menu_button
      .web_app.url,
    config.appUrl,
  );
  assert.equal(
    calls.find((c) => c.method === "setWebhook")!.body.secret_token,
    config.webhookSecret,
  );
});
test("A different bot identity cannot be modified", async () => {
  let requests = 0;
  const fake = async () => {
    requests++;
    return new Response(
      JSON.stringify({ ok: true, result: { username: "other_bot" } }),
    );
  };
  await assert.rejects(
    configureBot(config, fake as typeof fetch),
    /identity mismatch/,
  );
  assert.equal(requests, 1);
});
test("Bot setup failures never include the bot token in error messages", async () => {
  const fake = async () => {
    throw new Error(
      "network failed https://api.telegram.org/bot" + config.token + "/getMe",
    );
  };
  await assert.rejects(
    configureBot(config, fake as typeof fetch),
    (error) => error instanceof Error && !error.message.includes(config.token),
  );
});
