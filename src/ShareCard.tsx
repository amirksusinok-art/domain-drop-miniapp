import { useState } from "react";
import type { Domain } from "../shared/types";
import { number } from "./components";
export function ShareCard({ domain: d }: { domain: Domain }) {
  const [url, setUrl] = useState("");
  function create() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const c = canvas.getContext("2d");
    if (!c) return;
    const bg = c.createLinearGradient(0, 0, 1080, 1080);
    bg.addColorStop(0, "#172a46");
    bg.addColorStop(1, "#080d16");
    c.fillStyle = bg;
    c.fillRect(0, 0, 1080, 1080);
    c.strokeStyle = "#40638c";
    c.lineWidth = 2;
    c.strokeRect(60, 60, 960, 960);
    c.textAlign = "center";
    c.fillStyle = "#91adcf";
    c.font = "bold 30px sans-serif";
    c.fillText("DOMAIN DROP", 540, 180);
    c.fillStyle = "#bc9af3";
    c.font = "bold 34px sans-serif";
    c.fillText(d.rarity, 540, 320);
    let size = 120;
    c.font = `bold ${size}px monospace`;
    while (c.measureText(d.name + "." + d.tld).width > 880 && size > 32) {
      size -= 2;
      c.font = `bold ${size}px monospace`;
    }
    c.fillStyle = "#f4f7ff";
    c.fillText(d.name + "." + d.tld, 540, 485);
    c.fillStyle = "#bca5ff";
    c.font = "bold 48px monospace";
    if (d.serial) c.fillText("#" + String(d.serial).padStart(4, "0"), 540, 580);
    c.fillStyle = "#dce8ff";
    c.font = "bold 54px sans-serif";
    c.fillText(number(d.value) + " coins", 540, 705);
    c.fillStyle = "#91adcf";
    c.font = "24px sans-serif";
    c.fillText(d.tags.join(" · "), 540, 800, 880);
    c.font = "22px sans-serif";
    c.fillText("ВИРТУАЛЬНЫЙ КОЛЛЕКЦИОННЫЙ ДОМЕН", 540, 930);
    setUrl(canvas.toDataURL("image/png"));
  }
  return (
    <section className="share-card">
      <button className="secondary" onClick={create}>
        Карточка для публикации
      </button>
      {url && (
        <>
          <img
            src={url}
            alt={`${d.name}.${d.tld}${d.serial ? " #" + d.serial : ""} · ${d.rarity} · ${number(d.value)} coins`}
            style={{
              width: "100%",
              maxWidth: 360,
              display: "block",
              margin: "16px auto",
            }}
          />
          <a
            className="secondary"
            href={url}
            download={`${d.name}.${d.tld}${d.serial ? "-" + d.serial : ""}.png`}
          >
            Сохранить PNG
          </a>
        </>
      )}
    </section>
  );
}
