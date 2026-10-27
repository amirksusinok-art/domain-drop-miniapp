import { test } from "node:test";
import assert from "node:assert/strict";
import { initialNavigation, pushRoute, popRoute } from "../src/navigation.js";
import {
  displayName,
  readPreference,
  savePreference,
} from "../src/preferences.js";
test("Back unwinds More → Quick Sell without jumping to SPIN and restores parent scroll", () => {
  let nav = pushRoute(initialNavigation, "more", 0);
  nav = pushRoute(nav, "quick", 412);
  nav = popRoute(nav);
  assert.equal(nav.current.page, "more");
  assert.equal(nav.current.scroll, 412);
  assert.equal(popRoute(nav).current.page, "spin");
  assert.equal(popRoute(initialNavigation), initialNavigation);
});
test("Profile route retains public player and collection filter through Back; duplicate tabs do not grow stack", () => {
  let nav = pushRoute(initialNavigation, "collection", 0, {
    filter: "favorite",
  });
  nav = pushRoute(nav, "profile", 100, { publicId: "other-player" });
  nav = pushRoute(nav, "themes", 80);
  nav = popRoute(nav);
  assert.equal(nav.current.publicId, "other-player");
  nav = popRoute(nav);
  assert.equal(nav.current.filter, "favorite");
  assert.equal(pushRoute(nav, "collection", 0, { filter: "favorite" }), nav);
  assert.equal(pushRoute(nav, "collection", 0).current.filter, "all");
});
test("Display names add @ only to real usernames", () => {
  assert.equal(displayName({ username: "alex", first_name: "Иван" }), "@alex");
  assert.equal(displayName({ username: "", first_name: "Иван" }), "Иван");
  assert.equal(displayName({ username: null, first_name: null }), "Игрок");
});
test("Sound preferences persist and blocked WebView storage uses a safe fallback", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => values.set(k, v),
      },
    });
    assert.equal(readPreference("sound"), false);
    savePreference("sound", true);
    assert.equal(readPreference("sound"), true);
    savePreference("sound", false);
    assert.equal(readPreference("sound"), false);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    assert.equal(readPreference("sound"), false);
    assert.doesNotThrow(() => savePreference("sound", true));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as any).localStorage;
  }
});
