import { useEffect, useRef, useState } from "react";
import { number } from "./components";

// Interpolates server snapshots only. No game action reads this display value.
export function AnimatedBalance({ value }: { value: number }) {
  const current = useRef(value),
    previous = useRef(value);
  const [display, setDisplay] = useState(value);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const change = value - previous.current;
    previous.current = value;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setDelta(reduced ? 0 : change);
    const start = current.current,
      at = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      const progress = reduced ? 1 : Math.min(1, (now - at) / 420);
      current.current = Math.round(
        start + (value - start) * (1 - (1 - progress) ** 3),
      );
      setDisplay(current.current);
      if (progress < 1) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    const timer = setTimeout(() => setDelta(0), 1300);
    return () => {
      cancelAnimationFrame(handle);
      clearTimeout(timer);
    };
  }, [value]);
  return (
    <span className="animated-balance" aria-label={`${number(value)} coins`}>
      <b aria-hidden="true">{number(display)}</b>
      {!!delta && (
        <small
          aria-hidden="true"
          className={delta > 0 ? "balance-delta positive" : "balance-delta"}
        >
          {delta > 0 ? "+" : ""}
          {number(delta)}
        </small>
      )}
    </span>
  );
}
