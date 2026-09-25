import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, string>();

vi.mock("./settings", () => ({
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => {
    settings.set(key, value);
  },
}));

// Argon2 is deliberately slow, and what matters here is which branches reach a
// verification at all — not the algorithm, which has its own tests.
vi.mock("./password", () => ({
  hashPassword: async (password: string) => `hashed:${password}`,
  verifyPassword: async (storedHash: string, password: string) =>
    storedHash === `hashed:${password}`,
}));

const {
  MASTER_PASSWORD_ENABLED,
  MASTER_PASSWORD_HASH,
  isMasterPassword,
  masterPasswordProblem,
} = await import("./master-password");

const LIVE = "queue-desk-october";

function armed() {
  settings.set(MASTER_PASSWORD_HASH, `hashed:${LIVE}`);
  settings.set(MASTER_PASSWORD_ENABLED, "true");
}

beforeEach(() => {
  settings.clear();
});

describe("isMasterPassword", () => {
  it("opens a participant or judge account when it is armed", async () => {
    armed();

    await expect(isMasterPassword("PARTICIPANT", LIVE)).resolves.toBe(true);
    await expect(isMasterPassword("JUDGE", LIVE)).resolves.toBe(true);
  });

  it("never opens a super admin account", async () => {
    armed();

    // The one line that keeps a leaked master password survivable: it can impersonate
    // a participant, but it can never become control of the event.
    await expect(isMasterPassword("SUPER_ADMIN", LIVE)).resolves.toBe(false);
  });

  it("refuses the wrong password", async () => {
    armed();

    await expect(isMasterPassword("PARTICIPANT", "not-it")).resolves.toBe(false);
  });

  it("refuses while it is switched off, even though one is stored", async () => {
    settings.set(MASTER_PASSWORD_HASH, `hashed:${LIVE}`);
    settings.set(MASTER_PASSWORD_ENABLED, "false");

    await expect(isMasterPassword("PARTICIPANT", LIVE)).resolves.toBe(false);
  });

  it("refuses when the switch is on but nothing is stored", async () => {
    // Otherwise the login form would be checking an empty credential, and an empty
    // string is something a form can submit.
    settings.set(MASTER_PASSWORD_HASH, "");
    settings.set(MASTER_PASSWORD_ENABLED, "true");

    await expect(isMasterPassword("PARTICIPANT", "")).resolves.toBe(false);
    await expect(isMasterPassword("PARTICIPANT", "   ")).resolves.toBe(false);
  });

  it("refuses when it has never been configured at all", async () => {
    await expect(isMasterPassword("PARTICIPANT", LIVE)).resolves.toBe(false);
  });
});

describe("masterPasswordProblem", () => {
  it("accepts a long password", () => {
    expect(masterPasswordProblem(LIVE)).toBeNull();
  });

  it("rejects an empty one", () => {
    expect(masterPasswordProblem("")).toMatch(/enter a master password/i);
  });

  it("rejects one that is too short", () => {
    expect(masterPasswordProblem("short-pass")).toMatch(/at least 12/i);
  });

  it("rejects surrounding spaces", () => {
    // Read out across a hall and typed back, a trailing space is invisible and the
    // refusal it causes is unexplainable. Better to refuse it once, here.
    expect(masterPasswordProblem(` ${LIVE}`)).toMatch(/space/i);
    expect(masterPasswordProblem(`${LIVE} `)).toMatch(/space/i);
  });
});
