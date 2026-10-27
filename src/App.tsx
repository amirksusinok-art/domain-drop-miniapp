import {
  initialNavigation,
  pushRoute,
  popRoute,
  type Page,
} from "./navigation";
import { readPreference, savePreference } from "./preferences";
import { AnimatedBalance } from "./AnimatedBalance";
import { HomeOverview } from "./HomeOverview";
import {
  AdminConsole,
  QuickSell,
  Promo,
  Records,
  History,
} from "./SystemScreens";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
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
import type { Domain, State } from "../shared/types";
import { SpinPanel } from "./SpinPanel";
import { SpinExtras } from "./SpinExtras";
import { api, authenticate, mutation } from "./api";
import { setupTelegram } from "./telegram";
import { Empty, SectionTitle, number } from "./components";
import {
  Collection,
  DomainModal,
  Auctions,
  Scanner,
  Profile,
  Leaderboard,
  Themes,
  Rewards,
} from "./screens";
export function App() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [navigation, setNavigation] = useState(initialNavigation);
  const { page, filter: collectionFilter, publicId } = navigation.current;
  const [fast, setFast] = useState(() => {
    try {
      return localStorage.getItem("domain-drop-fast-spin") === "true";
    } catch {
      return false;
    }
  });
  function toggleFast() {
    setFast((current) => {
      const next = !current;
      try {
        localStorage.setItem("domain-drop-fast-spin", String(next));
      } catch {}
      return next;
    });
  }
  const [rerollFrom, setRerollFrom] = useState<Domain | null>(null);
  const [rolling, setRolling] = useState(false),
    [sound, setSound] = useState(() => readPreference("domain-drop-sound")),
    [selected, setSelected] = useState<Domain | null>(null),
    [toast, setToast] = useState(""),
    [refresh, setRefresh] = useState(0);
  function toggleSound() {
    setSound((current) => {
      savePreference("domain-drop-sound", !current);
      return !current;
    });
  }
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
  const canBack = !!selected || navigation.stack.length > 0;
  function goBack() {
    if (rolling) return;
    const dialog = document.querySelector("dialog[open]");
    if (dialog) {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      return;
    }
    if (selected) {
      setSelected(null);
      return;
    }
    setNavigation(popRoute);
  }
  useEffect(() => {
    const button = window.Telegram?.WebApp?.BackButton;
    const back = () => goBack();
    if (canBack) {
      button?.show();
      button?.onClick(back);
    } else button?.hide();
    return () => button?.offClick(back);
  }, [canBack, selected, rolling, navigation]);
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
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      window.scrollTo(0, navigation.current.scroll),
    );
    return () => cancelAnimationFrame(id);
  }, [
    navigation.current.page,
    navigation.current.publicId,
    navigation.current.filter,
  ]);
  function navigate(
    next: Page,
    options: Partial<{ filter: string; publicId: string | null }> = {},
  ) {
    if (rolling) return;
    setSelected(null);
    setNavigation((nav) => pushRoute(nav, next, window.scrollY, options));
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
  if (state.welcome !== null)
    return (
      <div className="panel welcome-panel">
        <h1>WELCOME TO DOMAIN DROP</h1>
        {toast && <p role="alert">{toast}</p>}
        <p>Тебе начислено {number(state.welcome)} стартовых coins</p>
        <button
          className="primary"
          disabled={busy}
          onClick={() => act("/welcome/ack")}
        >
          SPIN
        </button>
      </div>
    );
  const locked = busy || rolling;
  return (
    <div className="app" data-theme={p.theme} data-page={page}>
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
              ["collection", Layers3, "Коллекция"],
              ["quests", Target, "Задания"],
              ["spin", Disc3, "SPIN"],
              ["records", Trophy, "Рекорды"],
              ["more", Menu, "Ещё"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              className={
                page === key ||
                (key === "more" &&
                  !["collection", "spin", "quests", "records"].includes(page))
                  ? "active"
                  : ""
              }
              disabled={rolling}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              {label}
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
        <header
          className={"topbar " + (page === "spin" ? "minimal-topbar" : "")}
        >
          {canBack && (
            <button
              className="page-back"
              aria-label="Назад"
              disabled={rolling}
              onClick={goBack}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <button className="profile-chip" onClick={() => navigate("profile")}>
            <span className="avatar">{p.first_name.slice(0, 1)}</span>
            <span>
              <b>{p.first_name}</b>
              <small>УРОВЕНЬ {p.level}</small>
            </span>
          </button>
          <div className="top-actions">
            <span className="balance">
              <Coins size={19} />
              <AnimatedBalance value={p.coins} />
              <small>coins</small>
            </span>
          </div>
        </header>
        <main>
          {state.account.frozen && page !== "spin" && (
            <p className="account-notice">
              Экономика аккаунта заморожена. Коллекция доступна для просмотра.
            </p>
          )}
          {page === "spin" && (
            <SpinPanel
              state={state}
              previous={rerollFrom}
              rolling={rolling}
              busy={busy}
              sound={sound}
              fast={fast}
              onDone={() => setRolling(false)}
              act={act}
              onDetails={() => setSelected(state.pending)}
              onScanner={() => navigate("scanner")}
            />
          )}
          {page === "collection" && (
            <Collection
              refresh={refresh}
              initialFilter={collectionFilter}
              onFilterChange={(filter) =>
                setNavigation((nav) => ({
                  ...nav,
                  current: { ...nav.current, filter },
                }))
              }
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
                navigate("profile", { publicId: id });
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
            <AdminConsole refresh={refresh} busy={busy} act={act} />
          )}
          {page === "quick" && (
            <QuickSell state={state} busy={busy} act={act} />
          )}
          {page === "promo" && <Promo busy={busy} act={act} />}
          {page === "records" && (
            <Records refresh={refresh} onDetails={setSelected} />
          )}
          {page === "history" && <History refresh={refresh} />}
          {page === "more" && (
            <>
              <SectionTitle eyebrow="DOMAIN DROP" title="Ещё" />
              <HomeOverview
                state={state}
                refresh={refresh}
                busy={busy}
                act={act}
                onCollection={() => navigate("collection")}
                onDomain={setSelected}
                compact
              />
              {[
                {
                  title: "Игра",
                  items: [
                    { page: "scanner", icon: ScanLine, title: "Scanner" },
                    { page: "auction", icon: Trophy, title: "Аукцион" },
                    { page: "quests", icon: Target, title: "Задания" },
                    { page: "events", icon: Radio, title: "События" },
                  ],
                },
                {
                  title: "Коллекция",
                  items: [
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
                    { page: "sets", icon: Grid2X2, title: "Наборы" },
                    { page: "profile", icon: User, title: "Showcase" },
                    { page: "quick", icon: Zap, title: "Quick Sell" },
                  ],
                },
                {
                  title: "Профиль",
                  items: [
                    {
                      page: "records",
                      icon: Trophy,
                      title: "Глобальные рекорды",
                    },
                    { page: "achievements", icon: Star, title: "Достижения" },
                    { page: "themes", icon: Sparkles, title: "Темы" },
                    { page: "history", icon: Coins, title: "История операций" },
                    { page: "promo", icon: Sparkles, title: "Промокод" },
                    { page: "leaderboard", icon: Star, title: "Рейтинг" },
                  ],
                },
              ].map((group) => (
                <section className="more-group" key={group.title}>
                  <h2>{group.title}</h2>
                  <div className="menu-grid">
                    {group.items.map((item) => (
                      <button
                        key={item.title}
                        className="menu-item"
                        onClick={() =>
                          navigate(item.page as Page, {
                            filter: "filter" in item ? item.filter : "all",
                          })
                        }
                      >
                        <item.icon />
                        <span className="menu-copy">
                          <b>{item.title}</b>
                          <small>
                            {
                              (
                                {
                                  scanner: "Выбери одну из трёх находок",
                                  auction: "Торги за коллекционные домены",
                                  quests: "Ежедневные цели и награды",
                                  events: "Что происходит в игре",
                                  quick: "Правила автоматической продажи",
                                } as Record<string, string>
                              )[item.page]
                            }
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <details className="more-settings">
                <summary>Настройки</summary>
                <SpinExtras
                  state={state}
                  fast={fast}
                  sound={sound}
                  onFast={toggleFast}
                  onSound={toggleSound}
                />
              </details>
              {p.admin && (
                <button
                  className="secondary owner-entry"
                  onClick={() => navigate("admin")}
                >
                  <Settings2 size={18} />
                  Панель управления
                </button>
              )}
            </>
          )}
        </main>
        <footer className="page-footer">
          <span>DOMAIN DROP</span>
          <small>Коллекционируй то, что выпало.</small>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {(
          [
            ["collection", Layers3, "Коллекция"],
            ["quests", Target, "Задания"],
            ["spin", Disc3, "SPIN"],
            ["records", Trophy, "Рекорды"],
            ["more", Menu, "Ещё"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            className={
              (key === "spin" ? "nav-spin " : "") +
              (page === key ||
              (key === "more" &&
                !["collection", "spin", "quests", "records"].includes(page))
                ? "active"
                : "")
            }
            disabled={rolling}
            onClick={() => {
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
