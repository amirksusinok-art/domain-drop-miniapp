import { useState } from "react";
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
      <CardDecryption
        result={state.pending}
        previous={previous}
        animating={rolling}
        waiting={busy && !rolling}
        fast={fast}
        sound={sound}
        highValueThreshold={state.config.spinPrice * 20}
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
              (!p.free_spin && p.coins < state.config.spinPrice)
            }
            onClick={() => act("/spin", {}, true)}
          >
            <Zap size={20} />
            {p.free_spin
              ? "SPIN — FREE"
              : `SPIN — ${number(state.config.spinPrice)}`}
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
                : "Имя → зона → редкость. Что скрывает твой сигнал?"}
          </small>
        </div>
      )}
      <div className="luck">
        <span>
          <Sparkles size={15} /> LUCK{" "}
          <b>
            {p.pity}/{state.config.pityGuarantee}
          </b>
        </span>
        <div className="progress">
          <i
            style={{
              width: `${Math.min(100, (p.pity / state.config.pityGuarantee) * 100)}%`,
            }}
          />
        </div>
        <small>
          Rare+ не позднее {state.config.pityGuarantee}-го выпадения
        </small>
      </div>
    </section>
  );
}
