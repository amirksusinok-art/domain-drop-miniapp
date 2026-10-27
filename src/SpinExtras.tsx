import { useState } from "react";
import { Volume2, Zap, Sparkles } from "lucide-react";
import type { State } from "../shared/types";
import { number } from "./components";
export function SpinExtras({
  state,
  fast,
  sound,
  specialSound,
  onSpecialSound,
  onFast,
  onSound,
}: {
  state: State;
  fast: boolean;
  sound: boolean;
  specialSound: boolean;
  onSpecialSound: () => void;
  onFast: () => void;
  onSound: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const format = (n: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(n);
  return (
    <section className="panel spin-extras">
      <h3>Настройки SPIN</h3>
      <div className="spin-settings">
        <button className="secondary" aria-pressed={fast} onClick={onFast}>
          <Zap size={17} /> FAST SPIN · {fast ? "ВКЛ" : "ВЫКЛ"}
        </button>
        <button className="secondary" aria-pressed={sound} onClick={onSound}>
          <Volume2 size={17} /> Звук · {sound ? "ВКЛ" : "ВЫКЛ"}
        </button>
        <button
          className="secondary"
          aria-pressed={specialSound}
          onClick={onSpecialSound}
        >
          <Sparkles size={17} /> Legendary / Mythic ·{" "}
          {specialSound ? "ВКЛ" : "ВЫКЛ"}
        </button>
      </div>
      <p className="muted">
        RANDOM — сервер сам выбирает доменную зону. Цена:{" "}
        {number(
          state.config.zones.find((z) => z.name === "random")?.spinPrice ??
            state.config.spinPrice,
        )}{" "}
        coins. Luck этого режима считается отдельно.
      </p>
      <p className="muted">
        В дешёвых зонах чаще встречается Rare+, но находки стоят меньше. В
        дорогих — наоборот. Re-roll сохраняет выбранный режим: конкретную зону
        или RANDOM.
      </p>
      <button
        className="text-button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Sparkles size={15} /> Цены, шансы и Luck {expanded ? "↑" : "↓"}
      </button>
      {expanded && (
        <div className="zone-table-wrap">
          <table className="zone-table">
            <thead>
              <tr>
                <th>Зона</th>
                <th>SPIN</th>
                <th>Rare+ сейчас</th>
                <th>Luck</th>
              </tr>
            </thead>
            <tbody>
              {[...state.config.zones]
                .sort((a, b) =>
                  a.name === "random"
                    ? -1
                    : b.name === "random"
                      ? 1
                      : a.spinPrice - b.spinPrice,
                )
                .map((z) => (
                  <tr key={z.name}>
                    <td>{z.name === "random" ? "RANDOM" : "." + z.name}</td>
                    <td>{number(z.spinPrice)}</td>
                    <td>{format(z.rareChance)}</td>
                    <td>
                      {z.pity}/{state.config.pityGuarantee}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="fine-print">
        Домены — виртуальные коллекционные предметы. Их нельзя улучшать,
        регистрировать или обменивать на реальные деньги.
      </p>
    </section>
  );
}
