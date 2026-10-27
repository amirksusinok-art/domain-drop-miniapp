import { useEffect, useState } from "react";
import { ArrowRight, Check, RefreshCw, Zap } from "lucide-react";
import type { Domain, State } from "../shared/types";
import { CardDecryption } from "./CardDecryption";
import { number } from "./components";
import "./minimal-spin.css";
export function SpinPanel({
  state,
  previous,
  rolling,
  busy,
  sound,
  fast,
  onDone,
  act,
  onDetails,
  onScanner,
}: {
  state: State;
  previous: Domain | null;
  rolling: boolean;
  busy: boolean;
  sound: boolean;
  fast: boolean;
  onDone: () => void;
  act: (path: string, body?: unknown, animate?: boolean) => Promise<unknown>;
  onDetails: () => void;
  onScanner: () => void;
}) {
  const [chosen, setChosen] = useState(() => {
    try {
      return localStorage.getItem("domain-drop-zone") || "random";
    } catch {
      return "random";
    }
  });
  const p = state.profile,
    locked = busy || rolling || state.account.frozen,
    zones = state.config.zones;
  const pendingMode = state.pending?.spin_mode ?? state.pending?.tld;
  const selected =
    zones.find((z) => z.name === (pendingMode ?? chosen)) ??
    zones.find((z) => z.name === "random");
  useEffect(() => {
    if (pendingMode) setChosen(pendingMode);
  }, [pendingMode]);
  function choose(name: string) {
    setChosen(name);
    try {
      localStorage.setItem("domain-drop-zone", name);
    } catch {
      /* Selection is validated by the server. */
    }
  }
  const deficit =
    selected && !p.free_spin ? Math.max(0, selected.spinPrice - p.coins) : 0;
  return (
    <section
      className={
        "generator decryption-generator minimal-spin " +
        (rolling ? "is-opening" : "")
      }
      aria-label="Генератор доменов"
    >
      {state.account.frozen && (
        <p className="account-notice">
          Экономика аккаунта заморожена. Коллекция доступна для просмотра.
        </p>
      )}
      <div className={"zone-picker" + (state.pending ? " is-locked" : "")}>
        <label htmlFor="spin-zone">
          ЗОНА{" "}
          {state.pending
            ? pendingMode === "random"
              ? "RANDOM"
              : "." + state.pending.tld
            : ""}
        </label>
        <select
          id="spin-zone"
          value={selected?.name ?? ""}
          disabled={locked || !!state.pending || !!state.scanner}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="" disabled>
            Выбери зону
          </option>
          {[...zones]
            .sort((a, b) =>
              a.name === "random"
                ? -1
                : b.name === "random"
                  ? 1
                  : a.spinPrice - b.spinPrice || a.name.localeCompare(b.name),
            )
            .map((z) => (
              <option key={z.name} value={z.name}>
                {z.name === "random" ? "RANDOM" : "." + z.name} ·{" "}
                {number(z.spinPrice)} coins
              </option>
            ))}
        </select>
        <div className="zone-shortcuts">
          {["random", "ua", "ru", "xyz", "uk", "io", "ai", "com"].map(
            (name) => {
              const z = zones.find((z) => z.name === name);
              return z ? (
                <button
                  type="button"
                  className={selected?.name === name ? "active" : ""}
                  key={name}
                  disabled={locked || !!state.pending || !!state.scanner}
                  onClick={() => choose(name)}
                >
                  {name === "random" ? "RANDOM" : "." + name}
                  <small>{number(z.spinPrice)} ◈</small>
                </button>
              ) : null;
            },
          )}
        </div>
      </div>
      <CardDecryption
        selectedZone={selected?.name ?? "random"}
        result={state.pending}
        previous={previous}
        animating={rolling}
        waiting={busy && !rolling}
        fast={fast}
        sound={sound}
        highValueThreshold={
          (selected?.spinPrice ?? state.config.spinPrice) * 20
        }
        onDone={onDone}
        onDetails={onDetails}
      />
      <div
        className="compact-luck"
        aria-label={`Luck: ${selected?.pity ?? 0} из ${state.config.pityGuarantee}`}
      >
        <span>
          LUCK ·{" "}
          {selected && selected.rareChance >= 1
            ? "RARE+ ГАРАНТИРОВАН"
            : selected && selected.rareChance > selected.baseRareChance
              ? "BOOSTED"
              : "NORMAL"}
        </span>
        <progress
          max={state.config.pityGuarantee}
          value={selected?.pity ?? 0}
        />
      </div>
      {state.pending && !rolling && (
        <>
          {" "}
          <div className="drop-honors">
            {state.pending.discovery?.globalRecord && (
              <strong>NEW GLOBAL RECORD · #1 ALL TIME</strong>
            )}
            {state.pending.discovery?.personalBest && (
              <span>
                NEW PERSONAL BEST ·{" "}
                {number(state.pending.discovery.oldPersonal ?? 0)} →{" "}
                {number(state.pending.value)}
              </span>
            )}
            {state.pending.discovery?.firstFound && (
              <strong>
                FIRST FOUND · Ты первым обнаружил {state.pending.name}.
                {state.pending.tld} с запуска Serial
              </strong>
            )}
          </div>
        </>
      )}
      {state.pending && !rolling ? (
        state.pending.quick_sold ? (
          <div className="quick-sold">
            <h3>QUICK SOLD</h3>
            <p>+{number(state.pending.value)} coins</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => act("/drop/ack", { id: state.pending!.id })}
            >
              Продолжить
            </button>
          </div>
        ) : (
          <div className="decrypt-result-actions">
            <div className="result-actions">
              <button
                className="primary"
                disabled={locked}
                onClick={() =>
                  act("/domain", { id: state.pending!.id, action: "keep" })
                }
              >
                <Check size={18} /> Оставить
              </button>
              <button
                className="secondary"
                disabled={locked}
                onClick={() =>
                  act("/domain", { id: state.pending!.id, action: "sell" })
                }
              >
                Продать · {number(state.pending.value)}
              </button>
            </div>
            <button
              className="reroll"
              disabled={locked || (!p.reroll_available && !p.reroll_tokens)}
              onClick={() => act("/reroll", {}, true)}
            >
              <RefreshCw size={15} />
              {p.reroll_available
                ? "FREE RE-ROLL 1/1"
                : p.reroll_tokens
                  ? "RE-ROLL TOKEN · " + p.reroll_tokens
                  : "FREE RE-ROLL 0/1"}
            </button>
          </div>
        )
      ) : (
        <div className="spin-controls decrypt-controls">
          <button
            className="primary spin-button"
            disabled={
              locked ||
              !state.systems.flags.spin ||
              !!state.scanner ||
              !selected ||
              (!p.free_spin && p.coins < selected.spinPrice)
            }
            onClick={() =>
              selected && act("/spin", { tld: selected.name }, true)
            }
          >
            <Zap size={20} />
            {deficit > 0
              ? "НУЖНО ЕЩЁ " + number(deficit) + " COINS"
              : p.free_spin
                ? "SPIN — FREE"
                : selected
                  ? "SPIN — " + number(selected.spinPrice)
                  : "SPIN"}
            <ArrowRight size={18} />
          </button>
          {state.scanner && (
            <button className="text-button" onClick={onScanner}>
              Завершить открытый Scanner
            </button>
          )}
        </div>
      )}
    </section>
  );
}
