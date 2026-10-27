import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { Auction } from "../shared/types";
import { api } from "./api";
import { DomainCard, Empty, SectionTitle, number } from "./components";
import { displayName } from "./preferences";
type Action = (path: string, body?: unknown) => Promise<any>;
export function Auctions({
  refresh,
  busy,
  act,
}: {
  refresh: number;
  busy: boolean;
  act: Action;
}) {
  const [data, setData] = useState<Auction[] | null>(null),
    [error, setError] = useState(""),
    [watched, setWatched] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    let live = true,
      pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const rows = await api<Auction[]>("/auctions");
        if (live) {
          setData(rows);
          setError("");
        }
      } catch {
        if (live) setError("Не удалось обновить аукционы");
      } finally {
        pending = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const items = (data ?? []).filter((a) => !watched || a.watched);
  const sections = [
    {
      title: "DAILY AUCTION",
      items: items.filter((a) => a.status === "active" && a.kind === "daily"),
    },
    {
      title: "LIVE AUCTIONS",
      items: items.filter((a) => a.status === "active" && a.kind !== "daily"),
    },
    {
      title: "COMPLETED AUCTIONS",
      items: items.filter((a) => a.status !== "active"),
    },
  ];
  return (
    <>
      <SectionTitle eyebrow="РЕДКИЕ ДОМЕНЫ. ОДИН ПОБЕДИТЕЛЬ." title="Аукцион" />
      <p className="muted">
        Ставка резервирует coins. Если её перебьют, coins вернутся
        автоматически.
      </p>
      <div className="tabs">
        <button
          className={!watched ? "active" : ""}
          onClick={() => setWatched(false)}
        >
          Все лоты
        </button>
        <button
          className={watched ? "active" : ""}
          onClick={() => setWatched(true)}
        >
          ⭐ Отслеживаемые
        </button>
      </div>
      {error && <p role="status">{error}</p>}
      {!data && !error && <p role="status">Загружаем лоты…</p>}
      {data && items.length === 0 && (
        <Empty
          title={
            watched ? "Пока нет отслеживаемых лотов" : "Готовим новые лоты"
          }
        />
      )}
      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <section className="auction-section" key={section.title}>
              <h2>{section.title}</h2>
              <div
                className={
                  section.title === "DAILY AUCTION"
                    ? "auction-grid featured"
                    : "auction-grid"
                }
              >
                {section.items.map((a) => (
                  <AuctionItem
                    key={a.id}
                    a={a}
                    now={now}
                    busy={busy}
                    act={act}
                  />
                ))}
              </div>
            </section>
          ),
      )}
    </>
  );
}
function AuctionItem({
  a,
  now,
  busy,
  act,
}: {
  a: Auction;
  now: number;
  busy: boolean;
  act: Action;
}) {
  const [amount, setAmount] = useState(a.minimum);
  useEffect(() => setAmount(a.minimum), [a.minimum]);
  const seconds = Math.max(
    0,
    Math.ceil((new Date(a.ends_at).getTime() - now) / 1000),
  );
  const time = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  const bidder =
    a.bidder_name || a.bidder_username
      ? displayName({ username: a.bidder_username, first_name: a.bidder_name })
      : null;
  const ended = a.status !== "active";
  return (
    <article className="auction-lot">
      <header>
        <span className="eyebrow">
          {ended
            ? "AUCTION ENDED"
            : a.kind === "daily"
              ? "DAILY AUCTION"
              : a.kind === "live"
                ? "LIVE AUCTION"
                : "AUCTION"}
        </span>
        <button
          className="watch-star"
          aria-label={`${a.watched ? "Убрать из отслеживаемых" : "Отслеживать"} ${a.domain.name}.${a.domain.tld}`}
          aria-pressed={a.watched}
          disabled={busy}
          onClick={() =>
            act("/auction/watch", { id: a.id, watched: !a.watched })
          }
        >
          <Star size={20} fill={a.watched ? "currentColor" : "none"} />
        </button>
      </header>
      <DomainCard domain={a.domain} />
      <div className="auction-numbers">
        <strong>
          {ended && !a.bid ? "—" : number(a.bid || a.minimum)}{" "}
          <small>coins</small>
        </strong>
        <time
          className={
            !ended && seconds < 10
              ? "auction-timer closing"
              : !ended && seconds < 60
                ? "auction-timer soon"
                : "auction-timer"
          }
        >
          {ended ? "Завершён" : seconds ? time : "Завершение…"}
        </time>
      </div>
      <p className="auction-bidder">
        {ended
          ? bidder
            ? `Победитель: ${bidder}`
            : "Без ставок"
          : a.mine
            ? "Ваша ставка лидирует"
            : bidder
              ? `Лидирует: ${bidder}`
              : "Стартовая ставка"}
      </p>
      {ended && !!a.bid && (
        <p className="muted">Выигрышная ставка: {number(a.bid)} coins</p>
      )}
      {!ended && (
        <div className="auction-bid-form">
          <label>
            Ваша ставка
            <input
              aria-label={`Ставка за ${a.domain.name}.${a.domain.tld}`}
              type="number"
              min={a.minimum}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <button
            className="primary"
            disabled={
              busy ||
              seconds === 0 ||
              !Number.isSafeInteger(amount) ||
              amount < a.minimum
            }
            onClick={() => act("/auction/bid", { id: a.id, amount })}
          >
            Сделать ставку
          </button>
        </div>
      )}
    </article>
  );
}
