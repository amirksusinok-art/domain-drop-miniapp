import type { State } from "../shared/types";
let token = "";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, result.error ?? "Ошибка соединения");
  return result;
}
export async function authenticate() {
  const initData = window.Telegram?.WebApp?.initData;
  const bootstrap = await api<{ devAuth: boolean; botUsername: string }>(
    "/bootstrap",
  );
  let result: { token: string };
  if (initData) result = await api("/auth/telegram", { initData });
  else if (bootstrap.devAuth) result = await api("/auth/dev", {});
  else
    throw new Error(
      bootstrap.botUsername
        ? `Откройте @${bootstrap.botUsername} в Telegram и нажмите «Играть»`
        : "Откройте приложение через Telegram. Владелец ещё может настраивать подключение бота.",
    );
  token = result.token;
  return api<State>("/state");
}
export async function mutation<T = unknown>(
  path: string,
  body: unknown = {},
): Promise<{ state: State; data: T }> {
  const key = crypto.randomUUID();
  // Network failure can happen after commit. Retry with the SAME key.
  try {
    return await api(path, body, key);
  } catch (e) {
    if (e instanceof TypeError) return api(path, body, key);
    throw e;
  }
}
