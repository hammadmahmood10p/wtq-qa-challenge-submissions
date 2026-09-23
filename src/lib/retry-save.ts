/**
 * Keeping a save alive across a bad connection.
 *
 * The venues are three conference halls with a thousand laptops on the wifi. A save
 * will fail, and when it does the participant is mid-sentence in the fourth hour of a
 * three-hour morning — the last thing they should have to do is notice a red label and
 * remember to press a button.
 *
 * So a failed save is not an error, it is a retry. The value is kept, the attempt is
 * repeated on a widening delay, and a reconnect short-circuits the wait. What the
 * participant sees is "will keep trying", not "not saved".
 *
 * This is deliberately in-memory only. Draft work already lives on the server from the
 * previous successful save; persisting a queue to localStorage would mean a half-typed
 * bug report outliving the attempt it belongs to, and replaying it into a sealed one.
 */

/** 1s, 2s, 4s, 8s, then every 15s for as long as it takes. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];
const MAX_BACKOFF_MS = 15_000;

export function backoffFor(attempt: number): number {
  return BACKOFF_MS[attempt] ?? MAX_BACKOFF_MS;
}

/** False only when the browser is certain — `navigator.onLine` never lies about this. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface RetryHandle {
  cancel: () => void;
}

export interface RetryOptions {
  /** One save. True once the matter is settled, false if the server was unreachable. */
  attempt: () => Promise<boolean>;
  /** Called with the attempt count each time a retry is scheduled. */
  onRetryScheduled?: (attemptNumber: number, delayMs: number) => void;
  /** Runs once, when the matter is settled — whether the server said yes or no. */
  onSettled?: () => void;
  /** Gives up only when the caller says so — e.g. the value was superseded. */
  shouldStop?: () => boolean;
}

/**
 * Runs `attempt` until the matter is settled, backing off between tries and waking
 * early when the browser reports the connection is back.
 *
 * The distinction that matters is not success versus failure, it is *settled* versus
 * *unreachable*. A server that answers "no" has settled it — repeating the request
 * would get the same answer — while a request that never arrived has not. So
 * `attempt` returns true for both a save and a refusal, and false only when the
 * server could not be reached. A server action throws in exactly that case, which is
 * why the throw is what schedules a retry.
 *
 * Returns a handle so a newer edit to the same field can cancel the older save rather
 * than racing it — without that, a retry carrying stale text could land after a fresh
 * save and quietly undo it.
 */
export function retrySave({
  attempt,
  onRetryScheduled,
  onSettled,
  shouldStop,
}: RetryOptions): RetryHandle {
  let cancelled = false;
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waitingForOnline = false;

  const cleanup = () => {
    clearTimeout(timer);
    if (waitingForOnline) {
      window.removeEventListener("online", wake);
      waitingForOnline = false;
    }
  };

  function wake() {
    cleanup();
    if (!cancelled) void run();
  }

  async function run(): Promise<void> {
    if (cancelled || shouldStop?.()) return cleanup();

    const ok = await attempt().catch(() => false);

    if (cancelled || shouldStop?.()) return cleanup();

    if (ok) {
      cleanup();
      onSettled?.();
      return;
    }

    const delay = backoffFor(tries);
    onRetryScheduled?.(tries + 1, delay);
    tries++;

    // A reconnect is a much better signal than a timer, so listen for both and take
    // whichever comes first.
    if (!waitingForOnline && typeof window !== "undefined") {
      window.addEventListener("online", wake, { once: true });
      waitingForOnline = true;
    }

    timer = setTimeout(() => {
      if (waitingForOnline) {
        window.removeEventListener("online", wake);
        waitingForOnline = false;
      }
      void run();
    }, delay);
  }

  void run();

  return {
    cancel: () => {
      cancelled = true;
      cleanup();
    },
  };
}
