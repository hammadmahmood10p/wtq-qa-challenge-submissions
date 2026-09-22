"use client";

import { useEffect, useRef, useState } from "react";

export type TimerPhase = "calm" | "caution" | "warning" | "critical" | "expired";

/** Thresholds from DESIGN_LANGUAGE.md §2.4. */
const PHASES: { phase: TimerPhase; atOrBelowMs: number }[] = [
  { phase: "critical", atOrBelowMs: 5 * 60_000 },
  { phase: "warning", atOrBelowMs: 10 * 60_000 },
  { phase: "caution", atOrBelowMs: 30 * 60_000 },
];

export function phaseFor(remainingMs: number): TimerPhase {
  if (remainingMs <= 0) return "expired";
  return PHASES.find((p) => remainingMs <= p.atOrBelowMs)?.phase ?? "calm";
}

export function formatRemaining(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

interface Options {
  /** Milliseconds left according to the server when this page was rendered. */
  initialRemainingMs: number;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
}

/**
 * A countdown driven by the server's remaining time, not by either clock.
 *
 * Working from "how long is left" rather than "what time is it" sidesteps the whole
 * problem of a wrong laptop clock: there is no local time to be wrong. The deadline is
 * held in the browser's own monotonic-ish terms and re-anchored to the server
 * periodically, so a participant who changes their system clock sees no change at all.
 *
 * Two details worth knowing:
 *
 *  - The initial value comes from the server render, so the markup the server sent and
 *    the markup React hydrates agree. Deriving it from Date.now() would differ between
 *    the two and produce a hydration mismatch on the most important number on screen.
 *  - Re-anchoring ignores network transit, so the display can read up to one round trip
 *    (~200ms here) optimistic. That is deliberate and harmless: this is a display, and
 *    the server independently refuses writes past the real deadline.
 */
export function useCountdown({ initialRemainingMs, onExpire }: Options) {
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs);

  // Deadline expressed against the browser's own clock. Only ever written in effects.
  const deadlineRef = useRef(0);
  const expiredRef = useRef(false);
  // Held in a ref so a caller passing an inline arrow does not restart the interval
  // on every render. Kept current in its own effect rather than during render.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let cancelled = false;
    deadlineRef.current = Date.now() + initialRemainingMs;

    function tick() {
      const next = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(next);

      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);

    /**
     * Re-anchor against the server. A backgrounded tab or a sleeping machine will have
     * drifted, and the last five minutes are the worst moment to find the clock is out.
     */
    async function resync() {
      try {
        const response = await fetch("/api/attempt/status", { cache: "no-store" });
        if (!response.ok || cancelled) return;

        const data = (await response.json()) as { remainingMs: number };
        if (typeof data.remainingMs !== "number") return;

        deadlineRef.current = Date.now() + data.remainingMs;
        tick();
      } catch {
        // Offline or a blip — keep counting from the last known deadline.
      }
    }

    const resyncInterval = setInterval(resync, 60_000);
    // Returning to the foreground is the likeliest moment to be stale.
    document.addEventListener("visibilitychange", resync);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(resyncInterval);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [initialRemainingMs]);

  return { remainingMs, phase: phaseFor(remainingMs), formatted: formatRemaining(remainingMs) };
}
