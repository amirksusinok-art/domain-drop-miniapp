import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { State } from "../shared/types";
import { number } from "./components";

const popular = new Set([
  "random",
  "com",
  "ai",
  "io",
  "gg",
  "net",
  "org",
  "co",
]);
export function ZoneSheet({
  zones,
  selected,
  onChoose,
  onClose,
}: {
  zones: State["config"]["zones"];
  selected: string;
  onChoose: (name: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const node = dialog.current!;
    const y = window.scrollY;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    const back = window.Telegram?.WebApp?.BackButton;
    const wasVisible = back?.isVisible;
    back?.show();
    back?.onClick(onClose);
    return () => {
      back?.offClick(onClose);
      if (!wasVisible) back?.hide();
      node.close();
      document.body.style.overflow = overflow;
      window.scrollTo(0, y);
    };
  }, []);
  const filtered = zones.filter((z) =>
    z.name.includes(search.toLowerCase().replaceAll(".", "").trim()),
  );
  const groups = [
    { name: "POPULAR", zones: filtered.filter((z) => popular.has(z.name)) },
    {
      name: "REGIONAL",
      zones: filtered.filter(
        (z) => !popular.has(z.name) && z.name.length === 2,
      ),
    },
    {
      name: "OTHER",
      zones: filtered.filter(
        (z) => !popular.has(z.name) && z.name.length !== 2,
      ),
    },
  ];
  return (
    <dialog
      ref={dialog}
      className="zone-sheet"
      aria-labelledby="zone-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id="zone-sheet-title">ВЫБЕРИ ЗОНУ</h2>
        <button autoFocus aria-label="Закрыть выбор зоны" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <input
        aria-label="Поиск доменной зоны"
        placeholder="Найти зону"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="zone-sheet-list">
        {groups.map(
          (group) =>
            group.zones.length > 0 && (
              <section key={group.name}>
                <h3>{group.name}</h3>
                <div className="zone-sheet-grid">
                  {group.zones.map((z) => (
                    <button
                      key={z.name}
                      aria-pressed={z.name === selected}
                      onClick={() => onChoose(z.name)}
                    >
                      <b>{z.name === "random" ? "RANDOM" : "." + z.name}</b>
                      <small>{number(z.spinPrice)} coins</small>
                    </button>
                  ))}
                </div>
              </section>
            ),
        )}
        {!filtered.length && <p role="status">Зона не найдена</p>}
      </div>
    </dialog>
  );
}
