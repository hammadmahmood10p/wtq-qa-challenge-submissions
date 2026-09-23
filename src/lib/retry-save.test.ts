import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffFor, retrySave } from "./retry-save";

describe("backoffFor", () => {
  it("widens the gap between tries", () => {
    expect(backoffFor(0)).toBe(1_000);
    expect(backoffFor(1)).toBe(2_000);
    expect(backoffFor(2)).toBe(4_000);
    expect(backoffFor(3)).toBe(8_000);
  });

  it("settles at a ceiling rather than growing without bound", () => {
    // A participant reconnecting after twenty minutes should wait fifteen seconds,
    // not an hour, so the delay stops doubling.
    expect(backoffFor(4)).toBe(15_000);
    expect(backoffFor(50)).toBe(15_000);
  });
});

describe("retrySave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("stops after one try when the server answers", async () => {
    const attempt = vi.fn().mockResolvedValue(true);
    const onSettled = vi.fn();

    retrySave({ attempt, onSettled });
    await vi.advanceTimersByTimeAsync(0);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("keeps trying while the server is unreachable, then settles", async () => {
    // Two failures, then through. This is the ordinary bad-wifi case.
    const attempt = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const onSettled = vi.fn();

    retrySave({ attempt, onSettled });

    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempt).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown request as unreachable rather than as a refusal", async () => {
    // A server action throws when the request never arrives, which is exactly the
    // case worth repeating — it must not surface as "not saved".
    const attempt = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(true);
    const onSettled = vi.fn();

    retrySave({ attempt, onSettled });
    await vi.advanceTimersByTimeAsync(0);
    expect(onSettled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("reports each retry so the interface can say it is still trying", async () => {
    const attempt = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const onRetryScheduled = vi.fn();

    retrySave({ attempt, onRetryScheduled });
    await vi.advanceTimersByTimeAsync(0);

    expect(onRetryScheduled).toHaveBeenCalledWith(1, 1_000);
  });

  it("stops when cancelled, so a newer edit cannot be undone by an older retry", async () => {
    const attempt = vi.fn().mockResolvedValue(false);
    const onSettled = vi.fn();

    const handle = retrySave({ attempt, onSettled });
    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toHaveBeenCalledTimes(1);

    handle.cancel();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("gives up when the caller says the value is superseded", async () => {
    const attempt = vi.fn().mockResolvedValue(false);
    let stop = false;

    retrySave({ attempt, shouldStop: () => stop });
    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toHaveBeenCalledTimes(1);

    stop = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
