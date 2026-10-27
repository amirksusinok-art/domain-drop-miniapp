import { ShareCard } from "./ShareCard";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Coins,
  Disc3,
  Globe2,
  Grid2X2,
  Heart,
  Layers3,
  LockKeyhole,
  Menu,
  Radio,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import type { Auction, Domain, State } from "../shared/types";
import { rarities } from "../shared/types";
import { api, authenticate, mutation } from "./api";
import { setupTelegram } from "./telegram";
import { DomainCard, Empty, SectionTitle, colors, number } from "./components";
type Action = (path: string, body?: unknown, animate?: boolean) => Promise<any>;
function useLoad<T>(path: string, refresh: number) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    api<T>(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, refresh]);
  return { data, error };
}
function LoadError({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
export function Collection({
  refresh,
  initialFilter,
  onSelect,
  onFilterChange,
}: {
  refresh: number;
  initialFilter: string;
  onSelect: (d: Domain) => void;
  onFilterChange?: (filter: string) => void;
}) {
  const [filter, setFilter] = useState(initialFilter),
    [sort, setSort] = useState("date"),
    [rarity, setRarity] = useState(""),
    [search, setSearch] = useState(""),
    [tld, setTld] = useState(""),
    [tag, setTag] = useState(""),
    [page, setPage] = useState(0);
  const query = new URLSearchParams({
    filter,
    sort,
    search,
    page: String(page),
    ...(rarity ? { rarity } : {}),
    ...(tld ? { tld } : {}),
    ...(tag ? { tag } : {}),
  });
  const { data, error } = useLoad<{ items: Domain[]; total: number }>(
    "/collection?" + query,
    refresh,
  );
  useEffect(() => setPage(0), [filter, sort, rarity, search, tld, tag]);
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  return (
    <>
      <SectionTitle eyebrow="КАЖДАЯ НАХОДКА ОСТАЁТСЯ СОБОЙ" title="Коллекция">
        <span className="pill">{data?.total ?? 0} доменов</span>
      </SectionTitle>
      <div className="tabs">
        {[
          ["all", "Все домены"],
          ["favorite", "Избранное"],
          ["vault", "Сейф"],
          ["showcase", "Showcase"],
        ].map(([v, label]) => (
          <button
            className={filter === v ? "active" : ""}
            key={v}
            onClick={() => {
              setFilter(v);
              onFilterChange?.(v);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filters">
        <input
          aria-label="Поиск домена"
          placeholder="Найти домен…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Редкость"
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
        >
          <option value="">Все редкости</option>
          {rarities.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Сортировка"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {[
            ["date", "Сначала новые"],
            ["value", "По стоимости"],
            ["score", "По Score"],
            ["rarity", "По редкости"],
            ["tld", "По TLD"],
            ["length", "По длине"],
          ].map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          aria-label="Фильтр TLD"
          placeholder="TLD: ai, com…"
          value={tld}
          onChange={(e) => setTld(e.target.value.replace(/[^a-z]/g, ""))}
        />
        <select
          aria-label="Тег"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">Все теги</option>
          {[
            "SHORT",
            "ULTRA SHORT",
            "NUMERIC",
            "WORD",
            "TRIPLE",
            "PALINDROME",
            "PERFECT MATCH",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <LoadError error={error} />
      {data ? (
        data.items.length ? (
          <div className="collection-grid">
            {data.items.map((d) => (
              <DomainCard key={d.id} domain={d} onClick={() => onSelect(d)} />
            ))}
          </div>
        ) : (
          <Empty title="Здесь появятся твои находки">
            Сохрани домен после вращения. Если используешь фильтры, попробуй
            изменить их.
          </Empty>
        )
      ) : (
        <p className="muted">Загружаем коллекцию…</p>
      )}
      <div className="pagination">
        <button
          className="secondary"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          Назад
        </button>
        <span>Страница {page + 1}</span>
        <button
          className="secondary"
          disabled={!data || data.total <= (page + 1) * 40}
          onClick={() => setPage((p) => p + 1)}
        >
          Далее
        </button>
      </div>
    </>
  );
}
export function DomainModal({
  domain: d,
  own,
  busy,
  close,
  act,
}: {
  domain: Domain;
  own: boolean;
  busy: boolean;
  close: () => void;
  act: (action: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <span className="eyebrow">ИНСПЕКТОР ДОМЕНА</span>
        <button className="icon-button" aria-label="Закрыть" onClick={close}>
          <X />
        </button>
      </div>
      <DomainCard domain={d} />
      <div className="tags">
        {d.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <dl className="details">
        <div>
          <dt>Domain Score</dt>
          <dd>{d.score}</dd>
        </div>
        <div>
          <dt>Базовая стоимость</dt>
          <dd>{number(d.breakdown.base)}</dd>
        </div>
        <div>
          <dt>.{d.tld.toUpperCase()}</dt>
          <dd>×{d.breakdown.tldMultiplier}</dd>
        </div>
        <div>
          <dt>Бонус редкости</dt>
          <dd>×{d.breakdown.rarityBonus}</dd>
        </div>
        <div>
          <dt>Особые свойства</dt>
          <dd>×{d.breakdown.special.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Коэффициент экономики</dt>
          <dd>×{d.breakdown.scale}</dd>
        </div>
        <div className="total">
          <dt>Итоговая стоимость</dt>
          <dd>{number(d.value)} coins</dd>
        </div>
      </dl>
      <p className="muted">
        Имя, зона, редкость и цена зафиксированы при выпадении.
      </p>
      <ShareCard domain={d} />
      {own && d.status === "kept" && (
        <>
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => act("favorite")}
            >
              <Heart size={17} />
              {d.favorite ? "Убрать ♡" : "В избранное"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => act("vault")}
            >
              <LockKeyhole size={17} />
              {d.vaulted ? "Из сейфа" : "В сейф"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => act("showcase")}
            >
              <Star size={17} />
              {d.showcase ? "Снять с витрины" : "В Showcase"}
            </button>
          </div>
          <button
            className="secondary full"
            disabled={busy || d.favorite || d.vaulted || d.showcase}
            onClick={() => act("sell")}
          >
            Продать за {number(d.value)}
          </button>
        </>
      )}
    </dialog>
  );
}
export function Auctions({
  refresh,
  busy,
  act,
}: {
  refresh: number;
  busy: boolean;
  act: Action;
}) {
  const { data, error } = useLoad<Auction[]>("/auctions", refresh);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <SectionTitle eyebrow="РЕДКИЕ ДОМЕНЫ. ОДИН ПОБЕДИТЕЛЬ." title="Аукцион" />
      <p className="muted">
        Ставка резервирует coins. Если её перебьют, coins вернутся
        автоматически.
      </p>
      <LoadError error={error} />
      {data?.map((a) => (
        <AuctionItem key={a.id} a={a} now={now} busy={busy} act={act} />
      ))}
      {data?.length === 0 && <Empty title="Готовим следующий лот" />}
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
    Math.floor((new Date(a.ends_at).getTime() - now) / 1000),
  );
  const countdown = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return (
    <article className="auction-panel">
      <DomainCard domain={a.domain} />
      <div>
        <span className="eyebrow">
          {a.status === "active" ? "DAILY AUCTION" : "ЗАВЕРШЁН"}
        </span>
        <h2>{a.status === "active" ? countdown : "Лот закрыт"}</h2>
        <p>
          {a.bid
            ? `Текущая ставка: ${number(a.bid)} coins`
            : `Стартовая ставка: ${number(a.minimum)} coins`}
        </p>
        <p className="muted">
          {a.mine
            ? "Ваша ставка лидирует"
            : a.bidder_name
              ? `Лидирует: ${a.bidder_name}`
              : "Станьте первым участником"}
        </p>
        {a.status === "active" && (
          <div className="bid-form">
            <label>
              Ваша ставка
              <input
                type="number"
                min={a.minimum}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <button
              className="primary"
              disabled={busy || seconds === 0 || amount < a.minimum}
              onClick={() => act("/auction/bid", { id: a.id, amount })}
            >
              Сделать ставку
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
export function Scanner({
  state,
  busy,
  act,
  toSpin,
}: {
  state: State;
  busy: boolean;
  act: Action;
  toSpin: () => void;
}) {
  const [reveal, setReveal] = useState<{
    cards: Domain[];
    picked: number;
  } | null>(null);
  async function pick(index: number) {
    const data = await act("/scanner/pick", { id: state.scanner!.id, index });
    if (data) setReveal(data);
  }
  return (
    <>
      <SectionTitle eyebrow="ТРИ КАРТЫ. ОДИН ВЫБОР." title="Domain Scanner">
        <span className="pill">{state.profile.scanner_tokens} tokens</span>
      </SectionTitle>
      <section className="panel scanner-panel">
        <ScanLine size={38} />
        <h2>{reveal ? "Твоя находка раскрыта" : "Доверься интуиции"}</h2>
        <p className="muted">
          Выбери одну карту. Две остальные исчезнут. Содержимое определяет
          сервер до выбора.
        </p>
        <div className="scanner-cards">
          {[0, 1, 2].map((i) =>
            reveal ? (
              <div
                key={i}
                className={i === reveal.picked ? "picked" : "missed"}
              >
                <DomainCard domain={reveal.cards[i]} />
                <span>{i === reveal.picked ? "ТВОЙ ВЫБОР" : "ПРОПУЩЕНО"}</span>
              </div>
            ) : (
              <button
                key={i}
                className="scanner-card"
                disabled={busy || !state.scanner}
                onClick={() => pick(i)}
                aria-label={`Выбрать карту ${i + 1}`}
              >
                <Globe2 />
                <span>?</span>
                <small>DOMAIN DROP</small>
              </button>
            ),
          )}
        </div>
        {reveal || state.pending ? (
          <button className="primary" onClick={toSpin}>
            Оставить или продать <ArrowRight size={18} />
          </button>
        ) : !state.scanner ? (
          <button
            className="primary"
            disabled={busy || state.profile.scanner_tokens < 1}
            onClick={async () => {
              setReveal(null);
              await act("/scanner/open");
            }}
          >
            Открыть Scanner · 1 token
          </button>
        ) : (
          <p>Выбери карту выше</p>
        )}
        <p className="muted">
          Tokens можно получить за задания и новые уровни.
        </p>
      </section>
    </>
  );
}
export function Profile({
  state,
  publicId,
  onDomain,
  onThemes,
  onCollection,
}: {
  state: State;
  publicId: string | null;
  onDomain: (d: Domain) => void;
  onThemes: () => void;
  onCollection: () => void;
}) {
  const { data, error } = useLoad<{
    user: { username: string; first_name: string; level: number };
    domains: Domain[];
  }>(
    "/showcase/" + (publicId ?? state.profile.id),
    state.profile.collection_count,
  );
  const p = state.profile;
  return (
    <>
      <SectionTitle
        eyebrow="ТВОЯ ИСТОРИЯ НАХОДОК"
        title={publicId ? "Профиль игрока" : "Мой профиль"}
      />
      <LoadError error={error} />
      <div className="profile-hero">
        <span className="avatar large">
          {(data?.user.first_name ?? p.first_name)[0]}
        </span>
        <div>
          <h2>
            {data?.user.username
              ? "@" + data.user.username
              : (data?.user.first_name ?? p.first_name)}
          </h2>
          <p className="muted">
            Уровень {data?.user.level ?? p.level}
            {!publicId ? ` · ${number(p.xp)} XP` : ""}
          </p>
        </div>
        {!publicId && (
          <button className="secondary" onClick={onThemes}>
            Изменить тему
          </button>
        )}
      </div>
      {!publicId && (
        <>
          <div className="stats-grid">
            {[
              ["Вращения", number(p.spins)],
              ["Домены", number(p.collection_count)],
              ["Коллекция", number(p.collection_value) + " ◈"],
              ["Любимый TLD", p.favorite_tld ? "." + p.favorite_tld : "—"],
            ].map(([l, v]) => (
              <div className="stat" key={l}>
                <span>{l}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="rarity-stats">
            {rarities.slice(2).map((r) => (
              <span key={r} style={{ color: colors[r] }}>
                {r} <b>{p.rare_counts[r] ?? 0}</b>
              </span>
            ))}
          </div>
        </>
      )}
      <div className="discover-heading">
        <h3>Showcase</h3>
        <span>
          {!publicId ? "Выбери домены в коллекции" : "Лучшие находки игрока"}
        </span>
      </div>
      <div className="collection-grid">
        {data?.domains.map((d) => (
          <DomainCard key={d.id} domain={d} onClick={() => onDomain(d)} />
        ))}
      </div>
      {data && !data.domains.length && (
        <Empty title="Витрина ждёт свои находки">
          {!publicId && (
            <button className="text-button" onClick={onCollection}>
              Выбрать домены из коллекции →
            </button>
          )}
        </Empty>
      )}
      {!publicId && p.best_domain && (
        <>
          <h3>Самая дорогая находка в коллекции</h3>
          <DomainCard
            domain={p.best_domain}
            onClick={() => onDomain(p.best_domain!)}
          />
        </>
      )}
    </>
  );
}
export function Leaderboard({
  refresh,
  onProfile,
}: {
  refresh: number;
  onProfile: (id: string) => void;
}) {
  const { data, error } = useLoad<any[]>("/leaderboard", refresh);
  return (
    <>
      <SectionTitle eyebrow="ЛУЧШИЕ КОЛЛЕКЦИИ" title="Рейтинг игроков" />
      <p className="muted">
        По суммарной стоимости сохранённых доменов. Нажми на игрока, чтобы
        увидеть Showcase.
      </p>
      <LoadError error={error} />
      <div className="ranking">
        {data?.map((p) => (
          <button key={p.id} onClick={() => onProfile(p.id)}>
            <span className="rank">{String(p.rank).padStart(2, "0")}</span>
            <span className="avatar">{p.first_name[0]}</span>
            <span className="rank-name">
              <b>{p.username ? "@" + p.username : p.first_name}</b>
              <small>
                Уровень {p.level} · {p.domain_count} доменов
              </small>
            </span>
            <strong>{number(p.collection_value)} ◈</strong>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </>
  );
}
export function Themes({
  state,
  busy,
  act,
}: {
  state: State;
  busy: boolean;
  act: Action;
}) {
  const { data, error } = useLoad<
    { id: string; level: number; color: string }[]
  >("/themes", 0);
  return (
    <>
      <SectionTitle
        eyebrow="ТОЛЬКО СТИЛЬ. НИКАКОГО ВЛИЯНИЯ НА УДАЧУ."
        title="Темы"
      />
      <LoadError error={error} />
      <div className="theme-grid">
        {data?.map((t) => (
          <button
            className="theme-card"
            key={t.id}
            disabled={
              busy ||
              (state.profile.level < t.level && !state.cosmetics.includes(t.id))
            }
            onClick={() => act("/theme", { theme: t.id })}
          >
            <div className="theme-preview" style={{ color: t.color }}>
              <Globe2 size={40} />
              <strong>
                777<span>.ai</span>
              </strong>
            </div>
            <div>
              <b>{t.id}</b>
              <span>
                {state.profile.theme === t.id
                  ? "Выбрана"
                  : state.profile.level < t.level &&
                      !state.cosmetics.includes(t.id)
                    ? `С уровня ${t.level}`
                    : "Применить"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
export function Rewards({
  kind,
  refresh,
  busy,
  act,
}: {
  kind: "collections" | "achievements";
  refresh: number;
  busy: boolean;
  act: Action;
}) {
  const { data, error } = useLoad<any[]>("/" + kind, refresh);
  return (
    <>
      <SectionTitle
        eyebrow="СОБИРАЙ БОЛЬШЕ. ОТКРЫВАЙ НОВОЕ."
        title={kind === "collections" ? "Коллекционные наборы" : "Достижения"}
      />
      <LoadError error={error} />
      <div className="reward-grid">
        {data?.map((r) => {
          const done = kind === "collections" ? r.found.length : r.progress,
            target = kind === "collections" ? r.tlds.length : r.target;
          return (
            <article className="panel" key={r.id}>
              <Trophy size={24} />
              <h3>{r.title}</h3>
              {r.tlds && (
                <div className="tags">
                  {r.tlds.map((t: string) => (
                    <span
                      className={r.found.includes(t) ? "found" : ""}
                      key={t}
                    >
                      .{t}
                    </span>
                  ))}
                </div>
              )}
              <p className="muted">
                {done}/{target} · {number(r.coins)} coins
                {kind === "collections" ? " + 1 Re-roll" : ""}
              </p>
              <div className="progress">
                <i style={{ width: `${(done / target) * 100}%` }} />
              </div>
              <button
                className="secondary full"
                disabled={busy || r.claimed || done < target}
                onClick={() =>
                  act(
                    kind === "collections"
                      ? "/collection/claim"
                      : "/achievement/claim",
                    { id: r.id },
                  )
                }
              >
                {r.claimed ? "Получено" : "Забрать награду"}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
export function Admin({
  refresh,
  busy,
  act,
}: {
  refresh: number;
  busy: boolean;
  act: Action;
}) {
  const { data, error } = useLoad<any>("/admin", refresh);
  const [adminReason, setAdminReason] = useState("");
  const [config, setConfig] = useState(""),
    [validation, setValidation] = useState(""),
    [title, setTitle] = useState("AI WEEK"),
    [tld, setTld] = useState("ai"),
    [boost, setBoost] = useState(2),
    [auctionName, setAuctionName] = useState("777"),
    [auctionTld, setAuctionTld] = useState("ai"),
    [auctionPrice, setAuctionPrice] = useState(15000);
  useEffect(() => {
    if (data) setConfig(JSON.stringify(data.config, null, 2));
  }, [data]);
  async function save() {
    try {
      const parsed = JSON.parse(config);
      setValidation("");
      await act("/admin/config", { config: parsed, reason: adminReason });
    } catch {
      setValidation("Некорректный JSON");
    }
  }
  return (
    <>
      <SectionTitle eyebrow="ДОСТУП ВЛАДЕЛЬЦА" title="Панель управления" />
      <LoadError error={error} />
      <label>
        Причина изменения
        <input
          value={adminReason}
          onChange={(e) => setAdminReason(e.target.value)}
        />
      </label>
      <div className="panel">
        <h3>Экономика и TLD</h3>
        <p className="muted">
          Изменения применяются только к будущим выпадениям. Настройки проходят
          серверную проверку и сохраняются в журнале.
        </p>
        <label>
          Конфигурация JSON
          <textarea
            className="config-editor"
            rows={22}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
          />
        </label>
        <LoadError error={validation} />
        <button className="primary" disabled={busy} onClick={save}>
          Сохранить настройки
        </button>
      </div>
      <div className="panel">
        <h3>Запустить событие на 7 дней</h3>
        <div className="filters">
          <label>
            Название
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            TLD
            <input value={tld} onChange={(e) => setTld(e.target.value)} />
          </label>
          <label>
            Множитель веса
            <input
              type="number"
              min={1}
              max={10}
              value={boost}
              onChange={(e) => setBoost(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            act("/admin/event", {
              reason: adminReason,
              title,
              tld,
              boost,
              description: `Повышенный шанс .${tld} среди доменов одной редкости`,
              startsAt: new Date().toISOString(),
              endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            })
          }
        >
          Запустить событие
        </button>
      </div>
      <div className="panel">
        <h3>Новый аукционный лот</h3>
        <div className="filters">
          <label>
            Имя
            <input
              value={auctionName}
              onChange={(e) => setAuctionName(e.target.value)}
            />
          </label>
          <label>
            Зона
            <input
              value={auctionTld}
              onChange={(e) => setAuctionTld(e.target.value)}
            />
          </label>
          <label>
            Стартовая ставка
            <input
              type="number"
              min={100}
              value={auctionPrice}
              onChange={(e) => setAuctionPrice(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            act("/admin/auction", {
              reason: adminReason,
              name: auctionName,
              tld: auctionTld,
              startPrice: auctionPrice,
              hours: 6,
            })
          }
        >
          Открыть аукцион на 6 часов
        </button>
      </div>
      <div className="panel">
        <h3>Журнал изменений</h3>
        {data?.audit.map((a: any, i: number) => (
          <p key={i}>
            {new Date(a.created_at).toLocaleString("ru-RU")} · {a.action}
          </p>
        ))}
      </div>
    </>
  );
}
