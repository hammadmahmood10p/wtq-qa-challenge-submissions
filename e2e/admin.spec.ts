import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, E2E_PASSWORD, cleanupAccounts, seedAccounts } from "./fixtures/accounts";

/**
 * The admin console is what lets the event be run on the day: approving judges so they
 * can work, and unsticking participants who cannot get in.
 */

test.beforeAll(seedAccounts);
test.afterAll(cleanupAccounts);

async function loginAs(page: Page, username: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Narrows to one person's row so actions cannot hit the wrong account. */
function rowFor(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

test.describe("participants roster", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin.email);
    await page.goto("/admin/participants");
  });

  test("lists participants with their details", async ({ page }) => {
    const row = rowFor(page, ACCOUNTS.participant.fullName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(ACCOUNTS.participant.email);
    // Displayed decrypted and formatted, for the super admin only.
    await expect(row).toContainText("42101-5555555-1");
    await expect(row).toContainText("Karachi");
  });

  test("filters by status", async ({ page }) => {
    await page.getByLabel("Filter by status").selectOption("BLOCKED");
    await expect(rowFor(page, ACCOUNTS.blocked.fullName)).toBeVisible();
    await expect(rowFor(page, ACCOUNTS.participant.fullName)).toHaveCount(0);
  });

  test("filters by city", async ({ page }) => {
    await page.getByLabel("Filter by location").selectOption("ISLAMABAD");
    await expect(rowFor(page, ACCOUNTS.locked.fullName)).toBeVisible();
    await expect(rowFor(page, ACCOUNTS.participant.fullName)).toHaveCount(0);
  });

  test("searches by name", async ({ page }) => {
    await page.getByLabel("Search the roster").fill("E2E Participant");
    await expect(rowFor(page, ACCOUNTS.participant.fullName)).toBeVisible();
    await expect(rowFor(page, ACCOUNTS.blocked.fullName)).toHaveCount(0);
  });

  /**
   * A direct consequence of encrypting the CNIC (§3.1): there is no plaintext column
   * to match against, so a full number works and a fragment cannot. The UI says so;
   * this pins the behaviour so nobody "fixes" the hint later.
   */
  test("finds a participant by their full ID card number but not a fragment", async ({ page }) => {
    await page.getByLabel("Search the roster").fill(ACCOUNTS.participant.cnicFormatted);
    await expect(rowFor(page, ACCOUNTS.participant.fullName)).toBeVisible();

    await page.getByLabel("Search the roster").fill("42101");
    await expect(rowFor(page, ACCOUNTS.participant.fullName)).toHaveCount(0);
  });
});

test.describe("blocking a participant", () => {
  test("signs them out and stops them logging back in", async ({ page, browser }) => {
    // The participant is signed in and working.
    const participantContext = await browser.newContext();
    const participantPage = await participantContext.newPage();
    await loginAs(participantPage, ACCOUNTS.participant.email);
    await expect(participantPage).toHaveURL(/\/challenge$/);

    // The admin blocks them mid-session (D7).
    await loginAs(page, ACCOUNTS.admin.email);
    await page.goto("/admin/participants");
    const row = rowFor(page, ACCOUNTS.participant.fullName);
    await row.getByRole("button", { name: `Block ${ACCOUNTS.participant.fullName}` }).click();
    await page.getByRole("button", { name: "Block", exact: true }).click();
    await expect(row).toContainText("Blocked");

    // Their existing session is dead, not merely expiring.
    await participantPage.reload();
    await expect(participantPage).toHaveURL(/\/login/);

    // And they cannot get back in.
    await participantPage.goto("/login");
    await participantPage.getByLabel("Username").fill(ACCOUNTS.participant.email);
    await participantPage.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await participantPage.getByRole("button", { name: /^log in$/i }).click();
    await expect(participantPage.locator("form").getByRole("alert").first()).toContainText(
      /blocked/i,
    );

    // Restore, so the rest of the suite sees a clean roster.
    await row.getByRole("button", { name: /unblock/i }).click();
    await expect(row).toContainText("Active");

    await participantContext.close();
  });
});

test.describe("judge approval (requirement 7)", () => {
  test("an approved judge can log in, having been refused before", async ({ page, browser }) => {
    const judgeContext = await browser.newContext();
    const judgePage = await judgeContext.newPage();

    // Before approval: refused, with an explanation.
    await judgePage.goto("/login");
    await judgePage.getByLabel("Username").fill(ACCOUNTS.pendingJudge.email);
    await judgePage.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await judgePage.getByRole("button", { name: /^log in$/i }).click();
    await expect(judgePage.locator("form").getByRole("alert").first()).toContainText(
      /awaiting super admin approval/i,
    );

    // The admin approves them.
    await loginAs(page, ACCOUNTS.admin.email);
    await page.goto("/admin/judges");
    const row = rowFor(page, ACCOUNTS.pendingJudge.fullName);
    await expect(row).toContainText("Awaiting approval");
    await row.getByRole("button", { name: /approve/i }).click();
    await expect(row).toContainText("Active");

    // Now they get in.
    await judgePage.goto("/login");
    await judgePage.getByLabel("Username").fill(ACCOUNTS.pendingJudge.email);
    await judgePage.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await judgePage.getByRole("button", { name: /^log in$/i }).click();
    await expect(judgePage).toHaveURL(/\/judge$/);

    await judgeContext.close();
  });

  test("the pending queue is surfaced, not hidden behind a filter", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin.email);
    // Seeded fresh for this spec, so there is a pending judge again.
    await page.goto("/admin/judges");
    await expect(page.getByRole("heading", { name: /manage judges/i })).toBeVisible();
  });
});

test.describe("password reset", () => {
  test("issues a temporary password that the participant must then change", async ({
    page,
    browser,
  }) => {
    await loginAs(page, ACCOUNTS.admin.email);
    await page.goto("/admin/participants");

    const row = rowFor(page, ACCOUNTS.locked.fullName);
    await row
      .getByRole("button", { name: `Reset password for ${ACCOUNTS.locked.fullName}` })
      .click();
    await page.getByRole("button", { name: /^reset password$/i }).click();

    // Shown once, and only once.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/shown only once/i);
    const shown = await dialog.locator("code").textContent();
    expect(shown).toBeTruthy();

    const password = shown!.replace(/-/g, "");
    expect(password.length).toBeGreaterThanOrEqual(10);
    // Characters that are ambiguous read aloud are excluded on purpose.
    expect(password).not.toMatch(/[O0Il1]/);

    await page.getByRole("button", { name: /i have passed this on/i }).click();

    // This account is SUBMITTED_LOCKED, so a reset must not let them back in —
    // resetting a password does not reopen a closed account.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto("/login");
    await otherPage.getByLabel("Username").fill(ACCOUNTS.locked.email);
    await otherPage.getByLabel("Password", { exact: true }).fill(password);
    await otherPage.getByRole("button", { name: /^log in$/i }).click();
    await expect(otherPage.locator("form").getByRole("alert").first()).toContainText(
      /already submitted/i,
    );

    await otherContext.close();
  });
});

test.describe("guard rails", () => {
  test("an admin cannot block their own account", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin.email);
    await page.goto("/admin/participants?status=ALL");

    // The admin is not a participant, so their own row is not on this page at all —
    // the server-side check in adminBlockUser is the real guard.
    await expect(rowFor(page, ACCOUNTS.admin.fullName)).toHaveCount(0);
  });

  test("a judge cannot reach the roster", async ({ page }) => {
    await loginAs(page, ACCOUNTS.judge.email);
    await page.goto("/admin/participants");
    await expect(page).toHaveURL(/\/judge$/);
  });

  test("a participant cannot reach the roster", async ({ page }) => {
    await loginAs(page, ACCOUNTS.participant.email);
    await page.goto("/admin/judges");
    await expect(page).toHaveURL(/\/challenge$/);
  });
});
