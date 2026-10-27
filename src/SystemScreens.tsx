import { displayName } from "./preferences";
import { useEffect, useState } from "react";
import type { State, Domain } from "../shared/types";
import { api } from "./api";
import { DomainCard, SectionTitle, number } from "./components";
import { Admin as LegacyAdmin } from "./screens";
import "./systems.css";
type Act = (path: string, body?: unknown, animate?: boolean) => Promise<any>;
function useData<T = any>(path: string, refresh: number) {
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
function ErrorLine({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="system-error">
      {text}
    </p>
  ) : null;
}
export function QuickSell({
  state,
  busy,
  act,
}: {
  state: State;
  busy: boolean;
  act: Act;
}) {
  const [rules, setRules] = useState(state.quickSell.rules);
  const [zoneSearch, setZoneSearch] = useState("");
  useEffect(() => setRules(state.quickSell.rules), [state.quickSell]);
  const level = state.quickSell.level;
  return (
    <>
      <SectionTitle eyebrow="АВТОПРОДАЖА" title="Quick Sell" />
      <section className="panel system-panel">
        <h3>
          Уровень {level} / {state.systems.quickMaxLevel}
        </h3>
        <p>
          Rare+, Serial и защищённые паттерны автоматически сохраняются. Все
          включённые условия должны совпасть. После автопродажи Re-roll
          недоступен.
        </p>
        {!state.systems.quickEnabled && <p>Функция временно отключена</p>}
        {level < state.systems.quickMaxLevel && (
          <button
            className="primary"
            disabled={
              busy ||
              !state.systems.quickEnabled ||
              state.profile.coins < state.systems.quickCosts[level] ||
              state.profile.spins < state.systems.quickRequiredSpins[level]
            }
            onClick={() => act("/quick/upgrade")}
          >
            {level === 0 ? "Открыть" : "Уровень " + (level + 1)} ·{" "}
            {number(state.systems.quickCosts[level])} coins
          </button>
        )}
        {level < state.systems.quickMaxLevel && (
          <p className="muted">
            Для следующего уровня: {state.profile.spins} /{" "}
            {state.systems.quickRequiredSpins[level]} SPIN
          </p>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            disabled={level === 0}
            checked={rules.enabled}
            onChange={(e) => setRules({ ...rules, enabled: e.target.checked })}
          />
          Включить Quick Sell
        </label>
        <fieldset disabled={level === 0 || busy}>
          <legend>Редкость</legend>
          {(["COMMON", "UNCOMMON"] as const).map((r) => (
            <label className="check-row" key={r}>
              <input
                type="checkbox"
                disabled={r === "UNCOMMON" && level < 2}
                checked={rules.rarities.includes(r)}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    rarities: e.target.checked
                      ? [...rules.rarities, r]
                      : rules.rarities.filter((x) => x !== r),
                  })
                }
              />
              {r}
              {r === "UNCOMMON" && level < 2 ? " · уровень 2" : ""}
            </label>
          ))}
        </fieldset>
        <label>
          Цена строго ниже · уровень 3
          <input
            type="number"
            min="1"
            placeholder="Без ограничения"
            disabled={level < 3}
            value={rules.below ?? ""}
            onChange={(e) =>
              setRules({
                ...rules,
                below: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <fieldset className="quick-zones" disabled={level < 4 || busy}>
          <legend>Зоны · уровень 4</legend>
          <p>
            {rules.tlds.length
              ? "Выбрано зон: " + rules.tlds.length
              : "Все зоны: ограничение не задано"}
          </p>
          <input
            aria-label="Поиск зоны"
            placeholder="Найти зону"
            value={zoneSearch}
            onChange={(e) =>
              setZoneSearch(e.target.value.toLowerCase().replaceAll(".", ""))
            }
          />
          <div
            className="zone-chips"
            role="group"
            aria-label="Зоны для автопродажи"
          >
            {[
              ...new Set([
                ...rules.tlds,
                ...state.config.zones
                  .filter((z) => z.name !== "random")
                  .map((z) => z.name),
              ]),
            ]
              .filter((z) => z.includes(zoneSearch))
              .map((tld) => (
                <button
                  type="button"
                  key={tld}
                  aria-pressed={rules.tlds.includes(tld)}
                  onClick={() =>
                    setRules((current) => ({
                      ...current,
                      tlds: current.tlds.includes(tld)
                        ? current.tlds.filter((t) => t !== tld)
                        : [...current.tlds, tld],
                    }))
                  }
                >
                  .{tld}
                </button>
              ))}
          </div>
          {!!rules.tlds.length && (
            <button
              type="button"
              className="text-button"
              onClick={() => setRules({ ...rules, tlds: [] })}
            >
              Снять выбор · все зоны
            </button>
          )}
        </fieldset>
        <fieldset disabled={level < 5}>
          <legend>Дополнительная защита · уровень 5</legend>
          {(["SHORT", "TRIPLE", "PERFECT MATCH"] as const).map((t) => (
            <label className="check-row" key={t}>
              <input
                type="checkbox"
                checked={rules.keepTags.includes(t)}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    keepTags: e.target.checked
                      ? [...rules.keepTags, t]
                      : rules.keepTags.filter((x) => x !== t),
                  })
                }
              />
              KEEP {t}
            </label>
          ))}
          <label>
            Любимая зона
            <select
              value={rules.favoriteTld ?? ""}
              onChange={(e) =>
                setRules({ ...rules, favoriteTld: e.target.value || null })
              }
            >
              <option value="">Не выбрана</option>
              {state.config.zones
                .filter((z) => z.name !== "random")
                .map((z) => (
                  <option key={z.name} value={z.name}>
                    .{z.name}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        <p className="muted">
          Всегда защищены: {state.systems.protectedTags.join(", ")}.
          Дополнительные KEEP работают независимо от списка администратора.
        </p>
        <button
          className="primary"
          disabled={busy || !level || !rules.rarities.length}
          onClick={() => act("/quick/settings", rules)}
        >
          Сохранить правила
        </button>
      </section>
    </>
  );
}
export function Promo({ busy, act }: { busy: boolean; act: Act }) {
  const [code, setCode] = useState(""),
    [reward, setReward] = useState<any>(null);
  return (
    <>
      <SectionTitle eyebrow="НАГРАДЫ" title="Промокод" />
      <form
        className="panel system-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = await act("/promo/redeem", { code });
          if (d) setReward(d);
        }}
      >
        <label>
          Введите промокод
          <input
            maxLength={40}
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button className="primary" disabled={busy || code.trim().length < 3}>
          Активировать
        </button>
        {reward && (
          <p role="status">
            Награда получена: {reward.reward} · {number(reward.value)}
          </p>
        )}
      </form>
    </>
  );
}
export function Records({
  refresh,
  onDetails,
}: {
  refresh: number;
  onDetails: (d: Domain) => void;
}) {
  const { data, error } = useData("/records", refresh);
  return (
    <>
      <SectionTitle eyebrow="НАХОДКИ ИГРОКОВ" title="Глобальные рекорды" />
      <ErrorLine text={error} />
      <p className="muted">
        День — UTC, неделя — с понедельника. Serial выдаются с момента запуска
        системы.
      </p>
      <div className="records-grid">
        {[
          ["today", "TOP DROP TODAY"],
          ["week", "TOP DROP THIS WEEK"],
          ["all", "ALL-TIME RECORD"],
          ["rarest", "RAREST DROP"],
          ["first", "FIRST FOUND"],
        ].map(([key, title]) => (
          <section className="panel" key={key}>
            <h3>{title}</h3>
            {data?.[key] ? (
              <>
                <DomainCard
                  domain={data[key]}
                  onClick={() => onDetails(data[key])}
                />
                <p>{displayName(data[key])}</p>
              </>
            ) : (
              <p>Находок пока нет</p>
            )}
          </section>
        ))}
      </div>
      <h3>Global Feed</h3>
      <div className="system-feed">
        {data?.feed.map((d: any) => (
          <button key={d.id} onClick={() => onDetails(d)}>
            <b>{displayName(d)}</b> нашёл {d.name}.{d.tld}
            {d.serial ? " #" + String(d.serial).padStart(4, "0") : ""}
            <small>
              {d.rarity} · {number(d.value)} coins
            </small>
          </button>
        ))}
      </div>
    </>
  );
}
export function History({ refresh }: { refresh: number }) {
  const [page, setPage] = useState(0);
  const { data, error } = useData<any[]>("/history?page=" + page, refresh);
  return (
    <>
      <SectionTitle eyebrow="COINS" title="История операций" />
      <ErrorLine text={error} />
      <div className="system-feed">
        {data?.map((t) => (
          <article key={t.id}>
            <b>
              {t.reason.toUpperCase()} {Number(t.amount) >= 0 ? "+" : ""}
              {number(Number(t.amount))}
            </b>
            <small>
              {number(Number(t.balance_before))} →{" "}
              {number(Number(t.balance_after))} ·{" "}
              {new Date(t.created_at).toLocaleString("ru-RU")}
            </small>
            <small>{t.reference}</small>
          </article>
        ))}
      </div>
      <Pager page={page} setPage={setPage} more={data?.length === 50} />
    </>
  );
}
function Pager({
  page,
  setPage,
  more,
}: {
  page: number;
  setPage: (n: number) => void;
  more: boolean | undefined;
}) {
  return (
    <div className="system-tabs">
      <button
        className="secondary"
        disabled={!page}
        onClick={() => setPage(page - 1)}
      >
        Назад
      </button>
      <span>{page + 1}</span>
      <button
        className="secondary"
        disabled={!more}
        onClick={() => setPage(page + 1)}
      >
        Далее
      </button>
    </div>
  );
}
export function AdminConsole({
  refresh,
  busy,
  act,
}: {
  refresh: number;
  busy: boolean;
  act: Act;
}) {
  const [tab, setTab] = useState("dashboard");
  const { data, error } = useData("/admin/dashboard", refresh);
  return (
    <>
      <SectionTitle eyebrow="ДОСТУП ВЛАДЕЛЬЦА" title="Управление DOMAIN DROP" />
      <div className="system-tabs">
        {[
          ["dashboard", "Обзор"],
          ["players", "Игроки"],
          ["economy", "Экономика"],
          ["systems", "Системы"],
          ["promos", "Промокоды"],
          ["serials", "Serial Registry"],
          ["records", "Рекорды"],
          ["security", "Безопасность"],
          ["audit", "Аудит"],
          ["tools", "События и лоты"],
        ].map(([key, title]) => (
          <button
            className={tab === key ? "primary" : "secondary"}
            key={key}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </div>
      <ErrorLine text={error} />
      {tab === "dashboard" && data && (
        <>
          <div className="stat-grid">
            {Object.entries({
              ...data.users,
              ...data.drops,
              auctions: data.auctions,
              promo_redemptions: data.redemptions,
            }).map(([k, v]) => (
              <div className="panel" key={k}>
                <small>{k.replaceAll("_", " ").toUpperCase()}</small>
                <h3>{number(Number(v))}</h3>
              </div>
            ))}
          </div>
          <h3>Движение coins сегодня · UTC</h3>
          <DataTable rows={data.economy} />
        </>
      )}
      {tab === "players" && (
        <AdminPlayers refresh={refresh} busy={busy} act={act} />
      )}{" "}
      {tab === "economy" && data && (
        <EconomyEditor initial={data.config} busy={busy} act={act} />
      )}{" "}
      {tab === "systems" && data && (
        <SystemSettings initial={data.systems} busy={busy} act={act} />
      )}{" "}
      {tab === "promos" && (
        <AdminPromos refresh={refresh} busy={busy} act={act} />
      )}{" "}
      {tab === "serials" && <SerialRegistry refresh={refresh} />}{" "}
      {tab === "records" && <AdminRecords refresh={refresh} />}{" "}
      {tab === "security" && data && (
        <>
          <p>Флаги требуют ручной проверки. Автоматических банов нет.</p>
          {data.flags.map((f: any) => (
            <section className="panel" key={f.id}>
              <b>
                {f.kind} · {displayName(f)}
              </b>
              <p>
                {new Date(f.created_at).toLocaleString("ru-RU")} ·{" "}
                {JSON.stringify(f.detail)}
              </p>
              <p>Игрок: {f.user_id}</p>
              {f.resolved ? (
                <p>Проверено</p>
              ) : (
                <ReasonButton
                  busy={busy}
                  title="Отметить проверенным"
                  submit={(reason) =>
                    act("/admin/flag/resolve", { id: f.id, reason })
                  }
                />
              )}
            </section>
          ))}
        </>
      )}{" "}
      {tab === "audit" && <AdminAudit refresh={refresh} />}{" "}
      {tab === "tools" && (
        <LegacyAdmin refresh={refresh} busy={busy} act={act} />
      )}
    </>
  );
}
function DataTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="muted">Записей нет</p>;
  const keys = Object.keys(rows[0]);
  return (
    <div className="system-table">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              {keys.map((k) => (
                <td key={k}>
                  {typeof r[k] === "object"
                    ? JSON.stringify(r[k])
                    : String(r[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ReasonButton({
  busy,
  title,
  submit,
}: {
  busy: boolean;
  title: string;
  submit: (reason: string) => Promise<any>;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="system-form-row">
      <input
        aria-label="Причина"
        placeholder="Причина (обязательно)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        className="secondary"
        disabled={busy || reason.trim().length < 3}
        onClick={() => submit(reason)}
      >
        {title}
      </button>
    </div>
  );
}
function AdminPlayers({
  refresh,
  busy,
  act,
}: {
  refresh: number;
  busy: boolean;
  act: Act;
}) {
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("summary"),
    [page, setPage] = useState(0),
    [action, setAction] = useState("coins"),
    [amount, setAmount] = useState(0),
    [until, setUntil] = useState("");
  const results = useData<any[]>(
    "/admin/players?q=" + encodeURIComponent(q),
    refresh,
  );
  const detail = useData(
    "/admin/player/" +
      (selected || "00000000-0000-0000-0000-000000000000") +
      "?tab=" +
      tab +
      "&page=" +
      page,
    refresh,
  );
  return (
    <>
      <form
        className="system-form-row"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search);
        }}
      >
        <input
          aria-label="Поиск игрока"
          placeholder="Telegram ID, username или User ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="primary">Найти</button>
      </form>
      <ErrorLine text={results.error} />
      <div className="system-feed">
        {results.data?.map((u) => (
          <button
            key={u.id}
            onClick={() => {
              setSelected(u.id);
              setTab("summary");
              setPage(0);
            }}
          >
            {displayName(u)} · {u.telegram_id} · {number(Number(u.coins))} coins
          </button>
        ))}
      </div>
      {selected && (
        <>
          <div className="system-tabs">
            {[
              ["summary", "Профиль"],
              ["collection", "Коллекция"],
              ["transactions", "Транзакции"],
              ["spins", "SPIN"],
              ["auctions", "Аукцион"],
              ["scanner", "Scanner"],
            ].map(([k, t]) => (
              <button
                className="secondary"
                key={k}
                onClick={() => {
                  setTab(k);
                  setPage(0);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <ErrorLine text={detail.error} />
          {tab === "summary" ? (
            <>
              <PlayerSummary user={detail.data?.user} />
              <DataTable rows={detail.data?.stats ? [detail.data.stats] : []} />
              <DataTable rows={detail.data?.pity ?? []} />
              <section className="panel system-panel">
                <h3>Изменить аккаунт</h3>
                <label>
                  Действие
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    {[
                      ["coins", "Добавить / забрать coins"],
                      ["xp", "Добавить XP"],
                      ["reroll", "Изменить Re-roll tokens"],
                      ["scanner", "Изменить Scanner tokens"],
                      ["quick_level", "Установить Quick Sell Level"],
                      ["pity_reset", "Сбросить Pity"],
                      ["freeze", "Заморозить"],
                      ["unfreeze", "Разморозить"],
                      ["ban", "Заблокировать"],
                      ["unban", "Снять бан"],
                    ].map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Количество (минус — забрать)
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </label>
                {action === "ban" && (
                  <label>
                    До даты · пусто: навсегда
                    <input
                      type="datetime-local"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </label>
                )}
                {action === "coins" && detail.data?.user && (
                  <p>
                    Баланс после изменения:{" "}
                    {number(Number(detail.data.user.coins) + amount)}
                  </p>
                )}
                <ReasonButton
                  busy={busy}
                  title="Применить"
                  submit={(reason) =>
                    act("/admin/player/update", {
                      id: selected,
                      action,
                      amount,
                      until:
                        action === "ban" && until
                          ? new Date(until).toISOString()
                          : null,
                      reason,
                    })
                  }
                />
              </section>
            </>
          ) : (
            <>
              <DataTable rows={Array.isArray(detail.data) ? detail.data : []} />
              <Pager
                page={page}
                setPage={setPage}
                more={detail.data?.length === 40}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
function EconomyEditor({
  initial,
  busy,
  act,
}: {
  initial: any;
  busy: boolean;
  act: Act;
}) {
  const [cfg, setCfg] = useState(initial),
    [q, setQ] = useState("");
  useEffect(() => setCfg(initial), [initial]);
  return (
    <section className="panel system-panel">
      <h3>Экономика</h3>
      <p>
        Изменения действуют только на будущие выпадения. Стартовый баланс —
        только для новых аккаунтов.
      </p>
      {[
        ["startingBalance", "STARTING BALANCE"],
        ["spinPrice", "RANDOM Spin Price"],
        ["zonePriceBase", "База цены новых зон"],
        ["targetRtp", "Целевой RTP (0.8 = 80%)"],
        ["dailyReward", "Daily Reward"],
        ["dailyRerolls", "Daily Re-roll (0–1)"],
        ["pityStart", "Pity Start"],
        ["pityGuarantee", "Rare+ Guarantee"],
        ["pityBaseBoost", "Начальный Luck (доля)"],
        ["pityStep", "Шаг Luck"],
        ["pityMaxBoost", "Максимум Luck"],
        ["valueScale", "Коэффициент стоимости"],
      ].map(([key, title]) => (
        <label key={key}>
          {title}
          <input
            type="number"
            step="any"
            value={
              cfg[key] ??
              (
                {
                  pityBaseBoost: 0.01,
                  pityStep: 0.004,
                  pityMaxBoost: 0.08,
                } as any
              )[key] ??
              0
            }
            onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="check-row">
        <input
          type="checkbox"
          checked={cfg.maintenance}
          onChange={(e) => setCfg({ ...cfg, maintenance: e.target.checked })}
        />
        Maintenance Mode
      </label>
      <h3>Rarity Weights</h3>
      {["weights", "scannerWeights"].map((key) => (
        <label key={key}>
          {key}
          <input
            value={cfg[key].join(",")}
            onChange={(e) =>
              setCfg({ ...cfg, [key]: e.target.value.split(",").map(Number) })
            }
          />
        </label>
      ))}
      <h3>TLD</h3>
      <input
        aria-label="Поиск TLD"
        placeholder="Поиск зоны"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="system-table">
        <table>
          <thead>
            <tr>
              <th>TLD</th>
              <th>Enabled</th>
              <th>Price</th>
              <th>× Value</th>
              <th>Weight</th>
              <th>Score</th>
              <th>Rare+ chance</th>
            </tr>
          </thead>
          <tbody>
            {cfg.tlds.map((t: any, i: number) =>
              !q || t.name.includes(q) ? (
                <tr key={t.name}>
                  <td>.{t.name}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t.name + " enabled"}
                      checked={t.enabled !== false}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          tlds: cfg.tlds.map((x: any, j: number) =>
                            j === i ? { ...x, enabled: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                  </td>
                  {[
                    "spinPrice",
                    "multiplier",
                    "weight",
                    "score",
                    "rareChance",
                  ].map((k) => (
                    <td key={k}>
                      <input
                        aria-label={t.name + " " + k}
                        type="number"
                        step="any"
                        placeholder="auto"
                        value={t[k] ?? ""}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            tlds: cfg.tlds.map((x: any, j: number) =>
                              j === i
                                ? {
                                    ...x,
                                    [k]:
                                      e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </div>
      <ReasonButton
        busy={busy}
        title="Сохранить экономику"
        submit={(reason) => act("/admin/config", { config: cfg, reason })}
      />
    </section>
  );
}
function SystemSettings({
  initial,
  busy,
  act,
}: {
  initial: any;
  busy: boolean;
  act: Act;
}) {
  const [cfg, setCfg] = useState(initial);
  useEffect(() => setCfg(initial), [initial]);
  return (
    <section className="panel system-panel">
      <h3>Feature Flags</h3>
      {Object.keys(cfg.flags).map((k) => (
        <label key={k} className="check-row">
          <input
            type="checkbox"
            checked={cfg.flags[k]}
            onChange={(e) =>
              setCfg({ ...cfg, flags: { ...cfg.flags, [k]: e.target.checked } })
            }
          />
          {k.toUpperCase()}
        </label>
      ))}
      <h3>Quick Sell</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={cfg.quickEnabled}
          onChange={(e) => setCfg({ ...cfg, quickEnabled: e.target.checked })}
        />
        Включён
      </label>
      <label>
        Максимальный уровень
        <input
          type="number"
          min="0"
          max="5"
          value={cfg.quickMaxLevel}
          onChange={(e) =>
            setCfg({ ...cfg, quickMaxLevel: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Цены пяти уровней (через запятую)
        <input
          value={cfg.quickCosts.join(",")}
          onChange={(e) =>
            setCfg({
              ...cfg,
              quickCosts: e.target.value.split(",").map(Number),
            })
          }
        />
      </label>
      <label>
        Требования SPIN для пяти уровней
        <input
          value={cfg.quickRequiredSpins.join(",")}
          onChange={(e) =>
            setCfg({
              ...cfg,
              quickRequiredSpins: e.target.value.split(",").map(Number),
            })
          }
        />
      </label>
      {["COMMON", "UNCOMMON"].map((r) => (
        <label className="check-row" key={r}>
          <input
            type="checkbox"
            checked={cfg.quickRarities.includes(r)}
            onChange={(e) =>
              setCfg({
                ...cfg,
                quickRarities: e.target.checked
                  ? [...cfg.quickRarities, r]
                  : cfg.quickRarities.filter((v: string) => v !== r),
              })
            }
          />
          {r}
        </label>
      ))}
      <label>
        Всегда защищённые теги
        <input
          value={cfg.protectedTags.join(",")}
          onChange={(e) =>
            setCfg({
              ...cfg,
              protectedTags: e.target.value
                .split(",")
                .map((t) => t.trim().toUpperCase())
                .filter(Boolean),
            })
          }
        />
      </label>
      <h3>Serial Numbers</h3>
      <label>
        Минимальная редкость
        <select
          value={cfg.serialMinRarity}
          onChange={(e) => setCfg({ ...cfg, serialMinRarity: e.target.value })}
        >
          {["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].map(
            (r) => (
              <option key={r}>{r}</option>
            ),
          )}
        </select>
      </label>
      {["PERFECT MATCH", "ULTRA SHORT", "EVENT"].map((t) => (
        <label key={t} className="check-row">
          <input
            type="checkbox"
            checked={cfg.serialSpecial.includes(t)}
            onChange={(e) =>
              setCfg({
                ...cfg,
                serialSpecial: e.target.checked
                  ? [...cfg.serialSpecial, t]
                  : cfg.serialSpecial.filter((x: string) => x !== t),
              })
            }
          />
          {t}
        </label>
      ))}
      <h3>Пороги проверки безопасности</h3>
      {Object.keys(cfg.security).map((k) => (
        <label key={k}>
          {k}
          <input
            type="number"
            value={cfg.security[k]}
            onChange={(e) =>
              setCfg({
                ...cfg,
                security: { ...cfg.security, [k]: Number(e.target.value) },
              })
            }
          />
        </label>
      ))}
      <ReasonButton
        busy={busy}
        title="Сохранить настройки"
        submit={(reason) => act("/admin/systems", { config: cfg, reason })}
      />
    </section>
  );
}
function AdminPromos({
  refresh,
  busy,
  act,
}: {
  refresh: number;
  busy: boolean;
  act: Act;
}) {
  const { data, error } = useData<any[]>("/admin/promos", refresh);
  const [form, setForm] = useState({
    code: "",
    rewardType: "coins",
    rewardValue: 1000,
    cosmetic: "CYBER",
    totalLimit: 100,
    userLimit: 1,
    startsAt: "",
    expiresAt: "",
    enabled: true,
  });
  return (
    <>
      <form
        className="panel system-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.startsAt || !form.expiresAt) return;
          await act("/admin/promo/create", {
            ...form,
            startsAt: new Date(form.startsAt).toISOString(),
            expiresAt: new Date(form.expiresAt).toISOString(),
          });
        }}
      >
        <h3>Создать промокод</h3>
        <label>
          CODE
          <input
            required
            minLength={3}
            maxLength={40}
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
          />
        </label>
        <label>
          Награда
          <select
            value={form.rewardType}
            onChange={(e) => setForm({ ...form, rewardType: e.target.value })}
          >
            {["coins", "reroll", "scanner", "xp", "cosmetic"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {form.rewardType === "cosmetic" && (
          <label>
            Тема
            <select
              value={form.cosmetic}
              onChange={(e) => setForm({ ...form, cosmetic: e.target.value })}
            >
              {[
                "CYBER",
                "TERMINAL",
                "NEON",
                "GOLD",
                "MATRIX",
                "RETRO INTERNET",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
        {[
          ["rewardValue", "Количество"],
          ["totalLimit", "Всего использований"],
          ["userLimit", "Лимит на игрока"],
        ].map(([k, title]) => (
          <label key={k}>
            {title}
            <input
              type="number"
              required
              min="1"
              value={(form as any)[k]}
              onChange={(e) =>
                setForm({ ...form, [k]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        {[
          ["startsAt", "Начало"],
          ["expiresAt", "Окончание"],
        ].map(([k, title]) => (
          <label key={k}>
            {title}
            <input
              type="datetime-local"
              required
              value={(form as any)[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <button className="primary" disabled={busy}>
          Создать
        </button>
        <p className="muted">
          Награда после создания неизменна. Код можно отключить в любой момент.
        </p>
      </form>
      <ErrorLine text={error} />
      {data?.map((p) => (
        <section className="panel system-panel" key={p.id}>
          <h3>{p.code}</h3>
          <p>
            {p.reward_type} · {p.reward_value} · {p.enabled ? "ВКЛ" : "ВЫКЛ"}
          </p>
          <p>
            Uses {p.uses}/{p.total_limit} · Unique Users {p.unique_users} ·
            Rewards Issued {p.rewards_issued}
          </p>
          <small>
            Создан: {new Date(p.created_at).toLocaleString("ru-RU")} · До:{" "}
            {new Date(p.expires_at).toLocaleString("ru-RU")}
          </small>
          <ReasonButton
            busy={busy}
            title={p.enabled ? "Отключить" : "Включить"}
            submit={(reason) =>
              act("/admin/promo/toggle", {
                id: p.id,
                enabled: !p.enabled,
                reason,
              })
            }
          />
        </section>
      ))}
    </>
  );
}
function SerialRegistry({ refresh }: { refresh: number }) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(0);
  const { data, error } = useData<any[]>(
    "/admin/serials?q=" + encodeURIComponent(q) + "&page=" + page,
    refresh,
  );
  return (
    <>
      <input
        aria-label="Домен"
        placeholder="777.ai"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
      />
      <ErrorLine text={error} />
      <DataTable rows={data ?? []} />
      <Pager page={page} setPage={setPage} more={data?.length === 50} />
    </>
  );
}
function AdminRecords({ refresh }: { refresh: number }) {
  const { data, error } = useData("/admin/records", refresh);
  return (
    <>
      <ErrorLine text={error} />
      {data &&
        Object.entries(data)
          .filter(([k]) => k !== "feed")
          .map(([key, d]) => (
            <section className="panel" key={key}>
              <h3>{key}</h3>
              <DataTable rows={d ? [d] : []} />
            </section>
          ))}
    </>
  );
}

function AdminAudit({ refresh }: { refresh: number }) {
  const [page, setPage] = useState(0);
  const { data, error } = useData<any[]>("/admin/audit?page=" + page, refresh);
  return (
    <>
      <ErrorLine text={error} />
      <DataTable rows={data ?? []} />
      <Pager page={page} setPage={setPage} more={data?.length === 50} />
    </>
  );
}
function PlayerSummary({ user: u }: { user: any }) {
  if (!u) return <p>Игрок не найден</p>;
  return (
    <dl className="details">
      {[
        ["username", "Игрок"],
        ["telegram_id", "Telegram ID"],
        ["id", "User ID"],
        ["coins", "Coins"],
        ["xp", "XP"],
        ["level", "Уровень"],
        ["spins", "SPIN"],
        ["pity", "Последний Pity"],
        ["reroll_tokens", "Re-roll tokens"],
        ["scanner_tokens", "Scanner tokens"],
        ["quick_level", "Quick Sell Level"],
        ["created_at", "Регистрация"],
        ["frozen", "Freeze"],
        ["permanent_ban", "Постоянный бан"],
        ["banned_until", "Бан до"],
      ].map(([key, title]) => (
        <div key={key}>
          <dt>{title}</dt>
          <dd style={{ overflowWrap: "anywhere", maxWidth: "65%" }}>
            {typeof u[key] === "boolean"
              ? u[key]
                ? "Да"
                : "Нет"
              : String(u[key] ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
