import { useEffect, useState } from "react";
import type { State, Domain } from "../shared/types";
import { Coins, Check, ArrowRight, Layers3 } from "lucide-react";
import { api } from "./api";
import { DomainCard, SectionTitle, Empty, number } from "./components";
import { displayName } from "./preferences";
export function HomeOverview({
  state,
  refresh,
  busy,
  act,
  onCollection,
  onDomain,
  compact = false,
}: {
  compact?: boolean;
  state: State;
  refresh: number;
  busy: boolean;
  act: (path: string) => Promise<unknown>;
  onCollection: () => void;
  onDomain: (d: Domain) => void;
}) {
  const [feed, setFeed] = useState<
      (Domain & { username?: string; first_name?: string })[] | null
    >(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    api<{ feed: typeof feed }>("/records")
      .then((d) => {
        if (live) setFeed(d.feed);
      })
      .catch(() => {
        if (live)
          setError(
            "Не удалось загрузить находки. Попробуйте открыть главную ещё раз.",
          );
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  const p = state.profile;
  return (
    <>
      {!compact && (
        <SectionTitle eyebrow="DOMAIN DROP" title="Твой мир доменов" />
      )}
      <div className="home-grid">
        <button
          className="daily-promo"
          disabled={busy || p.daily_claimed}
          onClick={() => act("/daily")}
        >
          <span className="promo-icon">
            <Coins />
          </span>
          <div>
            <span className="eyebrow">ЕЖЕДНЕВНЫЙ БОНУС</span>
            <h3>
              {p.daily_claimed
                ? "Получено сегодня"
                : `+${number(state.config.dailyReward)} coins`}
            </h3>
            <p>
              {p.daily_claimed
                ? "Новая награда в 00:00 UTC"
                : "Забери награду и продолжай охоту"}
            </p>
          </div>
          {p.daily_claimed ? <Check /> : <ArrowRight />}
        </button>
        <button className="collection-promo" onClick={onCollection}>
          <div>
            <span className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</span>
            <h3>
              {p.collection_count} <small>доменов</small>
            </h3>
            <p>{number(p.collection_value)} coins</p>
          </div>
          <Layers3 size={32} />
        </button>
      </div>
      <details className="live-drops" open={!compact}>
        <summary>Последние редкие находки игроков</summary>
        <div className="discover-heading" hidden>
          <h2>Последние редкие находки игроков</h2>
        </div>
        {error ? (
          <p role="status">{error}</p>
        ) : feed === null ? (
          <p className="muted" role="status">
            Загружаем находки…
          </p>
        ) : feed.length ? (
          <div className="preview-grid">
            {feed.slice(0, 3).map((d) => (
              <article key={d.id}>
                <DomainCard domain={d} onClick={() => onDomain(d)} />
                <p className="drop-finder">{displayName(d)}</p>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Редкие находки ещё впереди">
            Здесь появятся реальные находки из глобальной ленты.
          </Empty>
        )}
      </details>
      <p className="fine-print">
        Домены — виртуальные коллекционные предметы. Их нельзя улучшать,
        регистрировать или обменивать на реальные деньги.
      </p>
    </>
  );
}
