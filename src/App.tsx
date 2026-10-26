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
import { SpinPanel } from "./SpinPanel";
import { api, authenticate, mutation } from "./api";
import { setupTelegram } from "./telegram";
import { DomainCard, Empty, SectionTitle, colors, number } from "./components";
import {
  Collection,
  DomainModal,
  Auctions,
  Scanner,
  Profile,
  Leaderboard,
  Themes,
  Rewards,
  Admin,
} from "./screens";
type Page =
  | "spin"
  | "collection"
  | "auction"
  | "scanner"
  | "quests"
  | "profile"
  | "more"
  | "themes"
  | "events"
  | "leaderboard"
  | "achievements"
  | "sets"
  | "admin";
export function App() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState<Page>("spin");
  const [rerollFrom, setRerollFrom] = useState<Domain | null>(null);
  const [rolling, setRolling] = useState(false),
    [sound, setSound] = useState(false),
    [selected, setSelected] = useState<Domain | null>(null),
    [toast, setToast] = useState(""),
    [refresh, setRefresh] = useState(0),
    [collectionFilter, setCollectionFilter] = useState("all"),
    [publicId, setPublicId] = useState<string | null>(null);
  const actionLock = useRef(false);
  const initialized = useRef(false);
  const start = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setupTelegram();
      setState(await authenticate());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void start();
    }
  }, [start]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const back = () => {
      setPage("spin");
      setPublicId(null);
      setSelected(null);
    };
    const button = window.Telegram?.WebApp?.BackButton;
    if (page !== "spin") {
      button?.show();
      button?.onClick(back);
    } else button?.hide();
    return () => button?.offClick(back);
  }, [page]);
  useEffect(() => {
    if (!state) return;
    const f = () => {
      if (
        document.visibilityState === "visible" &&
        !actionLock.current &&
        !rolling
      )
        api<State>("/state")
          .then(setState)
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [!!state, rolling]);
  async function act(path: string, body: unknown = {}, animate = false) {
    if (actionLock.current || rolling) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutation<any>(path, body);
      if (animate)
        setRerollFrom(path === "/reroll" ? (state?.pending ?? null) : null);
      setState(result.state);
      setRefresh((n) => n + 1);
      if (animate) setRolling(true);
      return result.data;
    } catch (e) {
      setToast((e as Error).message);
      try {
        setState(await api<State>("/state"));
      } catch {
        /* Keep visible state until connection recovers. */
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function navigate(next: Page) {
    if (rolling) return;
    setPublicId(null);
    setPage(next);
  }
  if (loading)
    return (
      <div className="splash">
        <div className="brand-mark">
          <Globe2 size={30} />
        </div>
        <h1>
          DOMAIN<span>DROP</span>
        </h1>
        <code>777.ai</code>
        <div className="loader" />
        <p>Загружаем вашу коллекцию</p>
      </div>
    );
  if (!state)
    return (
      <div className="splash">
        <Globe2 size={48} />
        <h1>DOMAIN DROP</h1>
        <p role="alert">{error}</p>
        <button className="primary" onClick={start}>
          Попробовать снова
        </button>
      </div>
    );
  const p = state.profile;
  const locked = busy || rolling;
  return (
    <div className="app" data-theme={p.theme}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("spin");
          }}
        >
          <div className="brand-mark">
            <Globe2 size={22} />
          </div>
          <span>
            DOMAIN<b>DROP</b>
          </span>
        </a>
        <span className="sidebar-label">ТВОЯ СЛЕДУЮЩАЯ НАХОДКА</span>
        <nav>
          {(
            [
              ["spin", Disc3, "Генератор"],
              ["collection", Layers3, "Коллекция"],
              ["auction", Trophy, "Аукцион"],
              ["scanner", ScanLine, "Scanner"],
              ["quests", Target, "Задания"],
              ["leaderboard", Star, "Рейтинг"],
              ["more", Menu, "Ещё"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              disabled={rolling}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              {label}
              {key === "quests" && (
                <span className="nav-count">
                  {state.quests.filter(
                    (q) => !q.claimed && q.progress >= q.target,
                  ).length || ""}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ShieldCheck size={17} />
          <span>
            Только виртуальные домены
            <br />
            <small>Коллекционируй. Находи. Сохраняй.</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="profile-chip" onClick={() => navigate("profile")}>
            <span className="avatar">{p.first_name.slice(0, 1)}</span>
            <span>
              <b>{p.username ? "@" + p.username : p.first_name}</b>
              <small>УРОВЕНЬ {p.level}</small>
            </span>
          </button>
          <div className="top-actions">
            <span className="balance">
              <Coins size={19} />
              <b>{number(p.coins)}</b>
              <small>coins</small>
            </span>
            <button
              className="icon-button"
              aria-label={sound ? "Выключить звук" : "Включить звук"}
              onClick={() => setSound(!sound)}
            >
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
          </div>
        </header>
        <main>
          {page === "spin" && (
            <>
              <SectionTitle
                eyebrow="THE NEXT ONE COULD BE YOURS"
                title="Поймай свой домен."
              >
                <span className="live-label">
                  <i /> DOMAIN GENERATOR
                </span>
              </SectionTitle>
              {!p.onboarded && !state.pending && (
                <div className="welcome">
                  <Sparkles size={22} />
                  <div>
                    <b>Твоя коллекция начинается здесь</b>
                    <p>
                      Вращай, находи редкие домены, сохраняй или продавай за
                      coins. Первое вращение — в подарок.
                    </p>
                  </div>
                </div>
              )}
              <SpinPanel
                state={state}
                previous={rerollFrom}
                rolling={rolling}
                busy={busy}
                sound={sound}
                onDone={() => setRolling(false)}
                act={act}
                onDetails={() => setSelected(state.pending)}
                onScanner={() => navigate("scanner")}
              />
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
                        ? "До завтра!"
                        : `+${number(state.config.dailyReward)} coins`}
                    </h3>
                    <p>
                      {p.daily_claimed
                        ? "Новая награда в 00:00 UTC"
                        : "Забери награду и продолжай охоту"}
                    </p>
                  </div>
                  {p.daily_claimed ? <Check /> : <ArrowUp />}
                </button>
                <button
                  className="collection-promo"
                  onClick={() => navigate("collection")}
                >
                  <div>
                    <span className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</span>
                    <h3>
                      {p.collection_count} <small>доменов</small>
                    </h3>
                    <p>Каждая находка — твоя история</p>
                  </div>
                  <Layers3 size={32} />
                </button>
              </div>
              <div className="discover-heading">
                <h3>За чем охотимся</h3>
                <span>Примеры редких находок</span>
              </div>
              <div className="preview-grid">
                {[
                  { name: "777", tld: "ai", rarity: "LEGENDARY" },
                  { name: "game", tld: "gg", rarity: "EPIC" },
                  { name: "888", tld: "com", rarity: "MYTHIC" },
                ].map((d) => (
                  <DomainCard key={d.name} domain={d} />
                ))}
              </div>
              <p className="fine-print">
                Домены — виртуальные коллекционные предметы. Их нельзя улучшать,
                регистрировать или обменивать на реальные деньги.
              </p>
            </>
          )}
          {page === "collection" && (
            <Collection
              refresh={refresh}
              initialFilter={collectionFilter}
              onSelect={setSelected}
            />
          )}
          {page === "quests" && (
            <>
              <SectionTitle
                eyebrow="НОВЫЙ ДЕНЬ — НОВЫЕ НАХОДКИ"
                title="Ежедневные задания"
              />
              <p className="muted">
                Обновляются в 00:00 UTC. Заберите выполненные награды до сброса.
              </p>
              <div className="quest-list">
                {state.quests.map((q) => (
                  <article className="quest" key={q.id}>
                    <div className="quest-icon">
                      <Target />
                    </div>
                    <div className="quest-info">
                      <h3>{q.title}</h3>
                      <span>
                        {number(q.coins)} coins · {q.xp} XP
                        {q.scanner ? " · 1 Scanner" : ""}
                        {q.reroll ? " · 1 Re-roll" : ""}
                      </span>
                      <div className="progress">
                        <i
                          style={{ width: `${(q.progress / q.target) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="quest-end">
                      <span>
                        {q.progress}/{q.target}
                      </span>
                      <button
                        className="secondary"
                        disabled={busy || q.claimed || q.progress < q.target}
                        onClick={() => act("/quest", { id: q.id })}
                      >
                        {q.claimed ? "Получено" : "Забрать"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {page === "auction" && (
            <Auctions refresh={refresh} busy={busy} act={act} />
          )}
          {page === "scanner" && (
            <Scanner
              state={state}
              busy={busy}
              act={act}
              toSpin={() => navigate("spin")}
            />
          )}
          {page === "profile" && (
            <Profile
              state={state}
              publicId={publicId}
              onDomain={setSelected}
              onThemes={() => navigate("themes")}
              onCollection={() => navigate("collection")}
            />
          )}
          {page === "leaderboard" && (
            <Leaderboard
              refresh={refresh}
              onProfile={(id) => {
                setPublicId(id);
                setPage("profile");
              }}
            />
          )}
          {page === "themes" && <Themes state={state} busy={busy} act={act} />}
          {page === "sets" && (
            <Rewards
              kind="collections"
              refresh={refresh}
              busy={busy}
              act={act}
            />
          )}
          {page === "achievements" && (
            <Rewards
              kind="achievements"
              refresh={refresh}
              busy={busy}
              act={act}
            />
          )}
          {page === "events" && (
            <>
              <SectionTitle eyebrow="ОСОБЫЕ НЕДЕЛИ" title="События" />
              {state.events.length ? (
                state.events.map((e) => (
                  <article className="panel" key={e.id}>
                    <span className="eyebrow">
                      .{e.tld.toUpperCase()} ×{Number(e.boost)}
                    </span>
                    <h2>{e.title}</h2>
                    <p>{e.description}</p>
                    <p className="muted">
                      До {new Date(e.ends_at).toLocaleString("ru-RU")}
                    </p>
                    <button
                      className="primary"
                      onClick={() => navigate("spin")}
                    >
                      Крутить <ArrowRight size={18} />
                    </button>
                  </article>
                ))
              ) : (
                <Empty title="Следующее событие готовится">
                  Здесь появятся тематические недели с повышенным шансом
                  отдельных TLD.
                </Empty>
              )}
            </>
          )}
          {page === "admin" && p.admin && (
            <Admin refresh={refresh} busy={busy} act={act} />
          )}
          {page === "more" && (
            <>
              <SectionTitle
                eyebrow="ЕЩЁ БОЛЬШЕ DOMAIN DROP"
                title="Твой мир доменов"
              />
              <div className="menu-grid">
                {(
                  [
                    {
                      page: "profile",
                      icon: User,
                      title: "Профиль и Showcase",
                    },
                    {
                      page: "collection",
                      icon: Heart,
                      title: "Избранное",
                      filter: "favorite",
                    },
                    {
                      page: "collection",
                      icon: LockKeyhole,
                      title: "Сейф",
                      filter: "vault",
                    },
                    {
                      page: "sets",
                      icon: Grid2X2,
                      title: "Коллекционные наборы",
                    },
                    { page: "themes", icon: Sparkles, title: "Темы" },
                    { page: "events", icon: Radio, title: "События" },
                    { page: "achievements", icon: Trophy, title: "Достижения" },
                    { page: "leaderboard", icon: Star, title: "Рейтинг" },
                    ...(p.admin
                      ? [
                          {
                            page: "admin",
                            icon: Settings2,
                            title: "Панель управления",
                          },
                        ]
                      : []),
                  ] as {
                    page: Page;
                    icon: typeof User;
                    title: string;
                    filter?: string;
                  }[]
                ).map((item) => (
                  <button
                    key={item.title}
                    className="menu-item"
                    onClick={() => {
                      setCollectionFilter(item.filter ?? "all");
                      navigate(item.page);
                    }}
                  >
                    <item.icon />
                    <b>{item.title}</b>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </>
          )}
        </main>
        <footer className="page-footer">
          <span>DOMAIN DROP</span>
          <small>Коллекционируй то, что выпало.</small>
        </footer>
      </div>
      <nav className="bottom-nav">
        {(
          [
            ["spin", Disc3, "Генератор"],
            ["collection", Layers3, "Коллекция"],
            ["auction", Trophy, "Аукцион"],
            ["quests", Target, "Задания"],
            ["more", Menu, "Ещё"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            className={page === key ? "active" : ""}
            disabled={rolling}
            onClick={() => {
              if (key === "collection") setCollectionFilter("all");
              navigate(key);
            }}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {selected && (
        <DomainModal
          domain={selected}
          own={!publicId}
          busy={busy}
          close={() => setSelected(null)}
          act={async (action) => {
            await act("/domain", { id: selected.id, action });
            setSelected(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function ArrowUp() {
  return <ArrowRight size={22} />;
}
