import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Globe2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { Domain } from "../shared/types";
import { haptic } from "./telegram";
import { colors, number } from "./components";
import {
  maskedText,
  reached,
  revealTimeline,
  type RevealFrame,
} from "./decryption";
import "./decryption.css";

const idle: RevealFrame = {
  at: 0,
  stage: "initializing",
  nameLocked: 0,
  tldLocked: 0,
};
export function CardDecryption({
  result,
  previous,
  animating,
  waiting,
  fast,
  sound,
  highValueThreshold,
  onDone,
  onDetails,
}: {
  result: Domain | null;
  previous: Domain | null;
  animating: boolean;
  waiting: boolean;
  fast: boolean;
  sound: boolean;
  highValueThreshold: number;
  onDone: () => void;
  onDetails: () => void;
}) {
  const [frame, setFrame] = useState<RevealFrame>(idle),
    [tick, setTick] = useState(0),
    [pulse, setPulse] = useState(0),
    [accelerated, setAccelerated] = useState(false);
  const clock = useRef({ elapsed: 0, last: 0, speed: 1, index: 0 }),
    done = useRef(onDone),
    audio = useRef<AudioContext | null>(null),
    soundRef = useRef(sound);
  done.current = onDone;
  soundRef.current = sound;
  useEffect(() => {
    if (!animating || !result) {
      setFrame(idle);
      setAccelerated(false);
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeline = revealTimeline(result, fast, reduced, !!previous);
    clock.current = { elapsed: 0, last: performance.now(), speed: 1, index: 0 };
    setFrame(timeline[0]);
    setAccelerated(false);
    let animation = 0,
      disposed = false,
      lastTick = 0;
    const click = (impact = false) => {
      if (reduced) return;
      haptic(
        impact
          ? ["LEGENDARY", "MYTHIC"].includes(result.rarity)
            ? "heavy"
            : "medium"
          : "light",
      );
      if (!soundRef.current) return;
      try {
        audio.current ??= new AudioContext();
        const ctx = audio.current;
        void ctx.resume().catch(() => {});
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.frequency.value = impact ? 180 : 1100;
        gain.gain.setValueAtTime(impact ? 0.045 : 0.018, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } catch {
        /* Audio may be unavailable inside WebView. */
      }
    };
    const advance = (now: number) => {
      if (disposed) return;
      const c = clock.current;
      c.elapsed += (now - c.last) * c.speed;
      c.last = now;
      if (now - lastTick >= 55) {
        setTick((t) => t + 1);
        lastTick = now;
      }
      let next = timeline[c.index];
      while (
        c.index + 1 < timeline.length &&
        timeline[c.index + 1].at <= c.elapsed
      ) {
        const before = next;
        next = timeline[++c.index];
        if (
          next.nameLocked > before.nameLocked ||
          next.tldLocked > before.tldLocked
        ) {
          setPulse((p) => p + 1);
          click(
            next.tldLocked === result.tld.length &&
              before.tldLocked < next.tldLocked,
          );
        }
        // Preserve each reveal layer for at least one rendered frame, even
        // when a tap or a backgrounded WebView advances the clock far ahead.
        if (next.stage !== before.stage) break;
      }
      setFrame((current) => (current === next ? current : next));
      if (next.stage === "ready") {
        done.current();
        return;
      }
      animation = requestAnimationFrame(advance);
    };
    animation = requestAnimationFrame(advance);
    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      if (audio.current) {
        void audio.current.close().catch(() => {});
        audio.current = null;
      }
    };
  }, [animating, result?.id, previous?.id]);
  const actual = animating
    ? frame
    : result
      ? {
          ...idle,
          stage: "ready" as const,
          nameLocked: result.name.length,
          tldLocked: result.tld.length,
        }
      : idle;
  const stage = actual.stage,
    domainReady = !!result && reached(stage, "multiplier"),
    rarityReady = !!result && reached(stage, "rarity"),
    valueReady = !!result && reached(stage, "value"),
    tagsReady = !!result && reached(stage, "tags");
  const destroying = animating && stage === "destroying" && previous;
  const display = destroying ? previous : result;
  const oldLocked = destroying
    ? Math.max(
        0,
        previous.name.length -
          Math.floor((clock.current.elapsed / 350) * previous.name.length),
      )
    : 0;
  const name =
    (!animating && !result) || waiting
      ? "###"
      : destroying
        ? maskedText(previous.name, oldLocked, tick)
        : display
          ? maskedText(display.name, actual.nameLocked, tick)
          : "###";
  const zone =
    (!animating && !result) || waiting
      ? "???"
      : destroying
        ? maskedText(previous.tld, 0, tick, true)
        : display
          ? maskedText(display.tld, actual.tldLocked, tick, true)
          : "???";
  const status = waiting
    ? "CONNECTING…"
    : !result && !animating
      ? "AWAITING SPIN"
      : {
          destroying: "RELEASING SIGNAL…",
          initializing: "INITIALIZING…",
          scramble: "RESOLVING DOMAIN…",
          name: "LOCKING CHARACTERS…",
          signal:
            result?.rarity === "MYTHIC"
              ? "UNKNOWN SIGNAL"
              : result?.rarity === "LEGENDARY"
                ? "SIGNAL FOUND"
                : "NAME RESOLVED",
          tld: "RESOLVING TLD…",
          multiplier: "TLD VERIFIED",
          analyzing: "ANALYZING…",
          rarity: "RARITY DETECTED",
          value: "VALUE CONFIRMED",
          tags: "SIGNAL DECODED",
          ready: "DOMAIN DECRYPTED",
        }[stage];
  function accelerate() {
    if (!animating || accelerated) return;
    clock.current.speed = 7;
    setAccelerated(true);
  }
  const rarity = rarityReady ? result!.rarity : "hidden";
  const dim =
    animating && result?.rarity === "MYTHIC" && reached(stage, "signal");
  return (
    <div
      className={
        "decryption-stage " +
        (animating ? "decrypting " : "") +
        (dim ? "mythic-focus" : "")
      }
      data-stage={waiting ? "waiting" : !result && !animating ? "idle" : stage}
      data-rarity={rarity}
    >
      <div className="data-stream" aria-hidden="true">
        {["DNS / 0X71", "NODE / A8F2", "TLD / RESOLVE", "SIGNAL / 1F04"].map(
          (s, i) => (
            <span key={s} style={{ "--stream-index": i } as CSSProperties}>
              {s}
            </span>
          ),
        )}
      </div>
      <div
        className="decrypt-card"
        style={
          {
            "--drop-color": rarityReady
              ? colors[result!.rarity]
              : "var(--accent)",
          } as CSSProperties
        }
      >
        <div className="decrypt-card-top">
          <span>
            <Globe2 size={16} />{" "}
            {domainReady ? "VERIFIED ASSET" : "ENCRYPTED ASSET"}
          </span>
          <span className="decrypt-indicator" />
          <span>DD / 001</span>
        </div>
        <button
          type="button"
          className="decrypt-surface"
          onClick={accelerate}
          disabled={!animating || accelerated}
          aria-label="Ускорить раскрытие домена"
          aria-describedby="decryption-status"
        >
          <span
            className={"decrypt-name " + (animating ? "has-pulse" : "")}
            key={pulse}
            aria-hidden="true"
          >
            <span className="decoded-name">{name}</span>
            <span
              className={"decoded-tld " + (domainReady ? "tld-verified" : "")}
            >
              .{zone}
            </span>
          </span>
          {animating &&
            stage === "signal" &&
            ["LEGENDARY", "MYTHIC"].includes(result!.rarity) && (
              <span className="signal-message">{status}</span>
            )}
        </button>
        <span className="sr-only">
          {domainReady && result
            ? `${result.name}.${result.tld}`
            : "Зашифрованная карточка домена"}
        </span>
        <div className="decrypt-status" id="decryption-status">
          <span
            className={
              animating || waiting ? "status-dot working" : "status-dot"
            }
          />
          {status}
          <span className="decrypt-hint">
            {animating
              ? accelerated
                ? "FAST TRACK"
                : "ТАП — УСКОРИТЬ"
              : result
                ? "VERIFIED"
                : "READY"}
          </span>
        </div>
        {animating && <div className="decrypt-scanline" aria-hidden="true" />}
        {rarityReady &&
          ["EPIC", "LEGENDARY", "MYTHIC"].includes(result!.rarity) && (
            <div className="decrypt-particles" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ "--particle-index": i } as CSSProperties} />
              ))}
            </div>
          )}
      </div>
      <div className="decrypt-rewards" aria-live="polite" aria-atomic="true">
        <div
          className={"reveal-layer " + (domainReady ? "is-revealed" : "")}
          aria-hidden={!domainReady}
        >
          {domainReady && (
            <span className="multiplier-reveal">
              .{result!.tld.toUpperCase()} MULTIPLIER{" "}
              <b>×{result!.breakdown.tldMultiplier}</b>
            </span>
          )}
        </div>
        <div
          className={"reveal-layer " + (rarityReady ? "is-revealed" : "")}
          aria-hidden={!rarityReady}
        >
          {rarityReady && (
            <span
              className="rarity-reveal"
              style={{ color: colors[result!.rarity] }}
            >
              <Sparkles size={13} />
              {result!.rarity}
            </span>
          )}
        </div>
        <div
          className={"reveal-layer " + (valueReady ? "is-revealed" : "")}
          aria-hidden={!valueReady}
        >
          {valueReady && (
            <>
              <button
                className="price-link"
                onClick={onDetails}
                disabled={animating}
              >
                {number(result!.value)} <span>COINS</span>
              </button>
              {result!.value >= highValueThreshold && (
                <span className="high-value">
                  <Zap size={11} /> HIGH VALUE
                </span>
              )}
            </>
          )}
        </div>
        <div
          className={
            "reveal-layer decrypt-tags " + (tagsReady ? "is-revealed" : "")
          }
          aria-hidden={!tagsReady}
        >
          {tagsReady && (
            <div className="tags">
              {result!.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {!result && !animating && (
        <p className="decrypt-idle-copy">
          <ShieldCheck size={13} /> Один сигнал. Твой следующий домен.
        </p>
      )}
    </div>
  );
}
