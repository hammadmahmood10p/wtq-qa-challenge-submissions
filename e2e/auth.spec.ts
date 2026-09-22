import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, E2E_PASSWORD, cleanupAccounts, seedAccounts } from "./fixtures/accounts";

/**
 * The critical path. If any of this breaks on 10 October, nobody gets in.
 */

test.beforeAll(seedAccounts);
test.afterAll(cleanupAccounts);

/** Fills the form and submits. Does not wait for the outcome. */
async function submitLogin(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
}

/**
 * Submits and waits until we have actually left the login page.
 *
 * Without this wait the next action races the sign-in request, and the failure looks
 * exactly like a broken session — a redirect back to /login — which is a misleading
 * place to start debugging.
 */
async function loginAs(page: Page, username: string, password: string) {
  await submitLogin(page, username, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** The whole-form error. Field-level errors are also role="alert", so scope to the form. */
function formAlert(page: Page) {
  return page.locator("form").getByRole("alert").first();
}

test.describe("login page", () => {
  test("is the main page of the application (requirement 2)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("asks for exactly two fields (requirement 8)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });
});

/** Requirement 9: email, ID card number or phone, all through the one box. */
test.describe("logging in with any registered identifier", () => {
  const cases = [
    ["email", ACCOUNTS.participant.email],
    ["email in a different case", ACCOUNTS.participant.email.toUpperCase()],
    ["ID card number with dashes", ACCOUNTS.participant.cnicFormatted],
    ["ID card number without dashes", ACCOUNTS.participant.cnic],
    ["phone in local format", ACCOUNTS.participant.phoneLocal],
    ["phone in E.164 format", ACCOUNTS.participant.phone],
  ] as const;

  for (const [label, identifier] of cases) {
    test(`accepts ${label}`, async ({ page }) => {
      await loginAs(page, identifier, E2E_PASSWORD);
      await expect(page).toHaveURL(/\/challenge$/);
      await expect(
        page.getByRole("heading", { name: `Welcome, ${ACCOUNTS.participant.fullName}` }),
      ).toBeVisible();
    });
  }
});

test.describe("rejecting bad credentials", () => {
  test("gives the same message for a wrong password and an unknown account", async ({ page }) => {
    await submitLogin(page, ACCOUNTS.participant.email, "WrongPassword1");
    await expect(formAlert(page)).toBeVisible();
    const wrongPassword = (await formAlert(page).textContent())?.trim();

    await submitLogin(page, "e2e.nobody@example.com", E2E_PASSWORD);
    await expect(formAlert(page)).toBeVisible();
    const unknownAccount = (await formAlert(page).textContent())?.trim();

    // The whole point: an attacker must not be able to tell these apart.
    expect(wrongPassword).toBe(unknownAccount);
    expect(wrongPassword).toMatch(/incorrect username or password/i);
  });

  test("stays on the login page", async ({ page }) => {
    await submitLogin(page, ACCOUNTS.participant.email, "WrongPassword1");
    await expect(formAlert(page)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("account status gates login", () => {
  test("a judge awaiting approval is told why (requirement 7)", async ({ page }) => {
    await submitLogin(page, ACCOUNTS.pendingJudge.email, E2E_PASSWORD);
    await expect(formAlert(page)).toContainText(/awaiting super admin approval/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("a blocked participant is refused", async ({ page }) => {
    await submitLogin(page, ACCOUNTS.blocked.email, E2E_PASSWORD);
    await expect(formAlert(page)).toContainText(/blocked/i);
  });

  test("a participant who has submitted cannot log in again", async ({ page }) => {
    await submitLogin(page, ACCOUNTS.locked.email, E2E_PASSWORD);
    await expect(formAlert(page)).toContainText(/already submitted/i);
  });

  test("status is not revealed to someone without the password", async ({ page }) => {
    await submitLogin(page, ACCOUNTS.pendingJudge.email, "WrongPassword1");
    await expect(formAlert(page)).toContainText(/incorrect username or password/i);
    await expect(formAlert(page)).not.toContainText(/approval/i);
  });
});

test.describe("role boundaries", () => {
  test("a super admin lands in the admin console", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin.email, E2E_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("a judge lands in the judge area", async ({ page }) => {
    await loginAs(page, ACCOUNTS.judge.email, E2E_PASSWORD);
    await expect(page).toHaveURL(/\/judge$/);
  });

  test("a participant cannot reach the admin console", async ({ page }) => {
    await loginAs(page, ACCOUNTS.participant.email, E2E_PASSWORD);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/challenge$/);
  });

  test("a judge cannot reach the admin console", async ({ page }) => {
    await loginAs(page, ACCOUNTS.judge.email, E2E_PASSWORD);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/judge$/);
  });

  test("an anonymous visitor is sent to login and remembered", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });
});

test.describe("session", () => {
  test("survives a page reload", async ({ page }) => {
    await loginAs(page, ACCOUNTS.participant.email, E2E_PASSWORD);
    await page.reload();
    await expect(page).toHaveURL(/\/challenge$/);
  });

  test("logging out ends it, and going back does not restore access", async ({ page }) => {
    await loginAs(page, ACCOUNTS.participant.email, E2E_PASSWORD);

    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL(/\/login/);

    await page.goto("/challenge");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the session cookie is httpOnly and not readable by script", async ({ page, context }) => {
    await loginAs(page, ACCOUNTS.participant.email, E2E_PASSWORD);

    const cookie = (await context.cookies()).find((c) => c.name === "wtq_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Strict");

    // If this ever returns the token, an XSS becomes a full account takeover.
    expect(await page.evaluate(() => document.cookie)).not.toContain("wtq_session");
  });
});
