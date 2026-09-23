import { describe, expect, it } from "vitest";
import {
  FALLBACK_REOPEN_MINUTES,
  MAX_REOPEN_MINUTES,
  MIN_REOPEN_MINUTES,
  remainingMinutesAtSubmit,
} from "./attempt-admin-limits";

const at = (iso: string) => new Date(iso);

describe("remainingMinutesAtSubmit", () => {
  it("gives back what was left when they submitted early", () => {
    expect(
      remainingMinutesAtSubmit({
        endsAt: at("2026-10-10T12:00:00Z"),
        submittedAt: at("2026-10-10T11:18:00Z"),
      }),
    ).toBe(42);
  });

  it("returns null when the clock had already run out", () => {
    // The auto-submit case: sealed at or after endsAt, so there is nothing to restore
    // and the admin must choose a figure themselves.
    expect(
      remainingMinutesAtSubmit({
        endsAt: at("2026-10-10T12:00:00Z"),
        submittedAt: at("2026-10-10T12:00:00Z"),
      }),
    ).toBeNull();

    expect(
      remainingMinutesAtSubmit({
        endsAt: at("2026-10-10T12:00:00Z"),
        submittedAt: at("2026-10-10T12:04:00Z"),
      }),
    ).toBeNull();
  });

  it("returns null for an attempt that never started or never sealed", () => {
    expect(remainingMinutesAtSubmit({ endsAt: null, submittedAt: null })).toBeNull();
    expect(
      remainingMinutesAtSubmit({ endsAt: at("2026-10-10T12:00:00Z"), submittedAt: null }),
    ).toBeNull();
    expect(
      remainingMinutesAtSubmit({ endsAt: null, submittedAt: at("2026-10-10T12:00:00Z") }),
    ).toBeNull();
  });

  it("rounds a sub-minute remainder up to one, never to zero", () => {
    // Zero is not a grant anyone would mean to make, and it would fail the action's
    // own minimum anyway — better to offer 1 and let the admin raise it.
    expect(
      remainingMinutesAtSubmit({
        endsAt: at("2026-10-10T12:00:00Z"),
        submittedAt: at("2026-10-10T11:59:59Z"),
      }),
    ).toBe(1);
  });

  it("rounds to the nearest minute", () => {
    expect(
      remainingMinutesAtSubmit({
        endsAt: at("2026-10-10T12:00:00Z"),
        submittedAt: at("2026-10-10T11:57:20Z"),
      }),
    ).toBe(3);
  });
});

describe("reopen bounds", () => {
  it("offers a default that is inside the range the action will accept", () => {
    // The dialog prefills FALLBACK_REOPEN_MINUTES when there is nothing to restore.
    // If that ever fell outside the bounds, every such reopen would be rejected.
    expect(FALLBACK_REOPEN_MINUTES).toBeGreaterThanOrEqual(MIN_REOPEN_MINUTES);
    expect(FALLBACK_REOPEN_MINUTES).toBeLessThanOrEqual(MAX_REOPEN_MINUTES);
  });
});
