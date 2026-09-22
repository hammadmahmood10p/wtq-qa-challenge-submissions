"use client";

/**
 * Cross-tab notification that the attempt is over (D13).
 *
 * The brief has participants working across several browser tabs at once — the
 * workspace plus a submission page per challenge. When one of them submits, the others
 * are still showing a running clock and an editable form. The server will refuse their
 * next write, but a participant should not have to discover that by trying.
 *
 * BroadcastChannel is the right size for this: same browser, same profile, no server
 * involvement. It is not a substitute for the server's own guard, only a way to keep
 * the interface honest. Where it is unavailable, the tabs fall back to noticing at
 * their next status poll.
 */

const CHANNEL = "wtq-attempt";
const CLOSED = "attempt-closed";

function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function announceAttemptClosed(): void {
  const bc = channel();
  if (!bc) return;

  try {
    bc.postMessage(CLOSED);
  } finally {
    bc.close();
  }
}

/** Returns an unsubscribe function. */
export function onAttemptClosed(handler: () => void): () => void {
  const bc = channel();
  if (!bc) return () => {};

  const listener = (event: MessageEvent) => {
    if (event.data === CLOSED) handler();
  };

  bc.addEventListener("message", listener);

  return () => {
    bc.removeEventListener("message", listener);
    bc.close();
  };
}
