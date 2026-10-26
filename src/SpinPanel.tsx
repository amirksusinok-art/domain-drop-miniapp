import { useState, useEffect } from "react";
import {
  ArrowRight,
  Check,
  Disc3,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import type { Domain, State } from "../shared/types";
import { CardDecryption } from "./CardDecryption";
import { number } from "./components";
export function SpinPanel({
  state,
  previous,
  rolling,
  busy,
  sound,
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
  onDone: () => void;
  act: (path: string, body?: unknown, animate?: boolean) => Promise<unknown>;
  onDetails: () => void;
  onScanner: () => void;
}) {
  const [fast, setFast] = useState(() => {
    try {
      return localStorage.getItem("domain-drop-fast-spin") === "true";
    } catch {
      return false;
    }
  });
  const p = state.profile,
    locked = busy || rolling;
  const [chosen, setChosen] = useState(() => {
    try {
      return localStorage.getItem("domain-drop-zone") ?? "";
    } catch {
      return "";
    }
  });
  const zones = state.config.zones;
  const selected = zones.find((z) => z.name === (state.pending?.tld ?? chosen));
  useEffect(() => {
    if (state.pending) setChosen(state.pending.tld);
  }, [state.pending?.id]);
  function choose(name: string) {
    setChosen(name);
    try {
      localStorage.setItem("domain-drop-zone", name);
    } catch {
      /* The server always validates the chosen zone. */
    }
  }
  function changeFast() {
    const next = !fast;
    setFast(next);
    try {
      localStorage.setItem("domain-drop-fast-spin", String(next));
    } catch {
      /* Cosmetic preference can remain in memory. */
    }
  }
  return (
    <section
      className={
        "generator decryption-generator " + (rolling ? "is-opening" : "")
      }
    >
      <div className="generator-top">
        <span>
          <Disc3 size={16} /> CARD DECRYPTION
        </span>
        <button
          type="button"
          className={"fast-spin " + (fast ? "enabled" : "")}
          aria-pressed={fast}
          disabled={locked}
          onClick={changeFast}
        >
          <Zap size={13} /> FAST SPIN{" "}
          <span className="toggle-track">
            <i />
          </span>
        </button>
      </div>
      <div className={"zone-picker" + (state.pending ? " is-locked" : "")}>
        <label htmlFor="spin-zone">
          ДОМЕННАЯ ЗОНА {state.pending ? `.${state.pending.tld}` : ""}{" "}
          <span>{zones.length} зон</span>
        </label>
        <select
          id="spin-zone"
          value={selected?.name ?? ""}
          disabled={locked || !!state.pending || !!state.scanner}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="" disabled>
            Выбери зону перед SPIN
          </option>
          {[...zones]
            .sort(
              (a, b) =>
                a.spinPrice - b.spinPrice || a.name.localeCompare(b.name),
            )
            .map((z) => (
              <option key={z.name} value={z.name}>
                .{z.name} · {number(z.spinPrice)} coins · Rare+{" "}
                {new Intl.NumberFormat("ru-RU", {
                  style: "percent",
                  maximumFractionDigits: 1,
                }).format(z.baseRareChance)}
              </option>
            ))}
        </select>
        <div className="zone-shortcuts">
          {["ua", "ru", "xyz", "uk", "io", "ai", "com"].map((name) => {
            const z = zones.find((z) => z.name === name);
            return z ? (
              <button
                type="button"
                className={selected?.name === name ? "active" : ""}
                key={name}
                disabled={locked || !!state.pending || !!state.scanner}
                onClick={() => choose(name)}
              >
                .{name}
                <small>{number(z.spinPrice)} ◈</small>
              </button>
            ) : null;
          })}
        </div>
        {selected ? (
          <div className="zone-summary">
            <span>
              Rare+{" "}
              <b>
                {new Intl.NumberFormat("ru-RU", {
                  style: "percent",
                  maximumFractionDigits: 1,
                }).format(selected.rareChance)}
              </b>
            </span>
            <span>
              Цена доменов <b>×{selected.multiplier}</b>
            </span>
            <span>
              SPIN <b>{number(selected.spinPrice)} ◈</b>
            </span>
          </div>
        ) : (
          <p className="zone-explanation">
            Дешёвые зоны — чаще Rare+, но дешевле находки. Дорогие — ниже шанс,
            выше стоимость доменов.
          </p>
        )}
        {state.pending && (
          <p className="zone-explanation">
            Зону можно сменить после «Оставить» или «Продать». Re-roll остаётся
            в .{state.pending.tld}.
          </p>
        )}
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
                ? `RE-ROLL TOKEN · ${p.reroll_tokens}`
                : "FREE RE-ROLL 0/1"}
          </button>
          <small className="muted">
            При Re-roll текущий домен исчезнет навсегда
          </small>
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
                ? `SPIN — ${number(selected.spinPrice)}`
                : "SPIN"}
            <ArrowRight size={18} />
          </button>
          {state.scanner && (
            <button className="text-button" onClick={onScanner}>
              Завершить открытый Scanner →
            </button>
          )}
          <small>
            {rolling
              ? "Раскрываем сигнал. Тап по карточке — ускорить."
              : p.free_spin
                ? "Первый Spin в подарок. Coins останутся на балансе."
                : selected
                  ? `Расшифровка домена в зоне .${selected.name}`
                  : "Сначала выбери доменную зону выше"}
          </small>
        </div>
      )}
      <div className="luck">
        <span>
          <Sparkles size={15} /> LUCK{" "}
          <b>
            {selected?.pity ?? 0}/{state.config.pityGuarantee}
          </b>
        </span>
        <div className="progress">
          <i
            style={{
              width: `${Math.min(100, ((selected?.pity ?? 0) / state.config.pityGuarantee) * 100)}%`,
            }}
          />
        </div>
        <small>
          Luck отдельно для каждой зоны · Rare+ до {state.config.pityGuarantee}
          -го выпадения
        </small>
      </div>
    </section>
  );
}
