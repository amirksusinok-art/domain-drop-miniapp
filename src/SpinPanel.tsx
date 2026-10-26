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
    locked = busy || rolling,
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
  return (
    <section
      className={
        "generator decryption-generator minimal-spin " +
        (rolling ? "is-opening" : "")
      }
      aria-label="Генератор доменов"
    >
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
      {state.pending && !rolling ? (
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
      ) : (
        <div className="spin-controls decrypt-controls">
          <button
            className="primary spin-button"
            disabled={
              locked ||
              !!state.scanner ||
              !selected ||
              (!p.free_spin && p.coins < selected.spinPrice)
            }
            onClick={() =>
              selected && act("/spin", { tld: selected.name }, true)
            }
          >
            <Zap size={20} />
            {p.free_spin
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
