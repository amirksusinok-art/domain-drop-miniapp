import { useEffect, useRef, useState } from "react";
import type { Domain } from "../shared/types";
import { api } from "./api";
import { colors, number } from "./components";
type Action = (path: string, body?: unknown) => Promise<any>;
type Quote = { id: string; count: number; total: number };

export function SellAllCommon({ busy, act }: { busy: boolean; act: Action }) {
  const [quote, setQuote] = useState<Quote | null>(null),
    [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  async function preview() {
    if (loading || busy) return;
    setLoading(true);
    try {
      const data = await act("/collection/common/preview");
      if (data) setQuote(data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (quote) dialog.current?.showModal();
  }, [quote]);
  useEffect(() => {
    if (!quote) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [!!quote]);
  return (
    <>
      <button
        className="secondary common-sale-button"
        disabled={busy || loading}
        onClick={preview}
      >
        Продать все Common
      </button>
      {quote && (
        <dialog
          ref={dialog}
          className="common-confirm"
          aria-labelledby="common-title"
          onCancel={(e) => {
            e.preventDefault();
            setQuote(null);
          }}
        >
          <h2 id="common-title">Продать все Common?</h2>
          <p>
            <strong>
              {quote.count} доменов · {number(quote.total)} coins
            </strong>
          </p>
          <p className="muted">
            Вся коллекция, независимо от фильтра. Избранное, сейф, Showcase,
            Serial и защищённые паттерны сохраняются.
          </p>
          <div className="common-confirm-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setQuote(null)}
            >
              Отмена
            </button>
            {quote.count > 0 && (
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  const result = await act("/collection/common/sell", {
                    id: quote.id,
                  });
                  if (result) setQuote(null);
                  else await preview();
                }}
              >
                Продать · {number(quote.total)}
              </button>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}

export function RecentDrops({
  refresh,
  paused,
  onDomain,
}: {
  refresh: number;
  paused: boolean;
  onDomain: (d: Domain) => void;
}) {
  const [items, setItems] = useState<Domain[] | null>(null),
    [error, setError] = useState(""),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (paused) return;
    let live = true;
    api<Domain[]>("/recent-drops")
      .then((data) => {
        if (live) {
          setItems(data);
          setError("");
        }
      })
      .catch(() => {
        if (live) setError("Не удалось загрузить последние находки");
      });
    return () => {
      live = false;
    };
  }, [refresh, paused]);
  return (
    <section className="recent-drops" aria-label="Последние выпадения">
      <header>
        <h2>RECENT DROPS</h2>
        <button
          className="text-button"
          disabled={!items || items.length <= 5}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Свернуть" : "До 10 находок"}
        </button>
      </header>
      {error && <p role="status">{error}</p>}
      {items?.length === 0 ? (
        <p className="muted">Здесь появятся твои первые находки.</p>
      ) : (
        <div className="recent-list">
          {Array.from({ length: expanded ? 10 : 5 }, (_, i) => {
            const d = items?.[i];
            return d ? (
              <button
                key={d.id}
                onClick={() => onDomain(d)}
                className="recent-drop"
              >
                <span>
                  <b style={{ color: colors[d.rarity] }}>
                    {d.name}.{d.tld}
                  </b>
                  <small>
                    {d.rarity} ·{" "}
                    {d.quick_sold
                      ? "QUICK SOLD"
                      : {
                          kept: "В коллекции",
                          sold: "Продан",
                          destroyed: "Re-roll",
                          pending: "Результат",
                        }[d.status]}
                  </small>
                </span>
                <strong>{number(d.value)} ◈</strong>
              </button>
            ) : (
              <div key={i} className="recent-placeholder" aria-hidden="true" />
            );
          })}
        </div>
      )}
    </section>
  );
}
