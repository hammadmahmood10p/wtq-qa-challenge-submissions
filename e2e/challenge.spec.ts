import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, E2E_PASSWORD, cleanupAccounts, resetAttempt, seedAccounts } from "./fixtures/accounts";

/**
 * The timed run. This is the irreversible part: if the clock can be cheated, extended
 * or restarted, the event is unfair in a way that cannot be corrected afterwards.
 */

test.beforeAll(seedAccounts);
test.afterAll(cleanupAccounts);

// Each test starts from a participant who has not begun.
test.beforeEach(async () => {
  await resetAttempt(ACCOUNTS.participant.email);
});

async function loginAsParticipant(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ACCOUNTS.participant.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

function beginButton(page: Page) {
  return page.getByRole("button", { name: /let's begin with the challenge/i });
}

test.describe("the information page", () => {
  test("shows the briefing and the begin button before starting", async ({ page }) => {
    await loginAsParticipant(page);
    await expect(page).toHaveURL(/\/challenge$/);

    await expect(page.getByRole("heading", { name: /your qa challenge/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /manual qa/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /ai chatbot quality evaluation/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /automation readiness/i })).toBeVisible();
    await expect(beginButton(page)).toBeVisible();
  });

  /**
   * Requirement 2. The participant opens this page again mid-test for reference, and
   * it must not offer a way back to the start line. Decided from the attempt's state
   * on the server, so it cannot be defeated by editing the URL.
   */
  test("hides the begin button once the challenge is running", async ({ page }) => {
    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);

    await page.goto("/challenge");
    await expect(page.getByRole("heading", { name: /your qa challenge/i })).toBeVisible();
    await expect(beginButton(page)).toHaveCount(0);
    await expect(page.getByText(/already running/i)).toBeVisible();
  });
});

test.describe("starting the challenge", () => {
  test("starts the clock and opens the workspace", async ({ page }) => {
    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);

    const timer = page.getByText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(timer).toBeVisible();
    // Three hours, less the second or two spent getting here.
    await expect(timer).toHaveText(/^02:5\d:\d{2}$/);
  });

  test("the countdown actually counts down", async ({ page }) => {
    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);

    const timer = page.getByText(/^\d{2}:\d{2}:\d{2}$/);
    const first = await timer.textContent();
    await expect(timer).not.toHaveText(first!, { timeout: 5000 });
  });

  /**
   * The guard is in the database WHERE clause, not the button — a refresh, a double
   * click or a second tab must never hand someone a fresh three hours.
   */
  test("cannot be restarted to gain more time", async ({ page }) => {
    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);

    const before = await page.getByText(/^\d{2}:\d{2}:\d{2}$/).textContent();

    // Go back to the briefing and try to start again by any route available.
    await page.goto("/challenge");
    await expect(beginButton(page)).toHaveCount(0);

    await page.goto("/challenge/run");
    const after = await page.getByText(/^\d{2}:\d{2}:\d{2}$/).textContent();

    // Time has gone down, never back up.
    expect(after!.localeCompare(before!)).toBeLessThanOrEqual(0);
  });

  test("the workspace cannot be reached without starting", async ({ page }) => {
    await loginAsParticipant(page);
    await page.goto("/challenge/run");
    await expect(page).toHaveURL(/\/challenge$/);
    await expect(beginButton(page)).toBeVisible();
  });
});

test.describe("the workspace", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);
  });

  test("has three challenge tabs, navigable by keyboard", async ({ page }) => {
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);

    await expect(page.getByRole("tab", { selected: true })).toContainText("Challenge 1");

    await page.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Challenge 2");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Challenge 3");

    // Wraps around rather than dead-ending.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Challenge 1");
  });

  test("each challenge links to its submission page in a new tab", async ({ page }) => {
    const link = page.getByRole("link", { name: /open challenge 1 submission/i });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", "/challenge/c1");
  });

  /** Requirement 1: reachable during the test, in a new tab so nothing is lost. */
  test("keeps the briefing reachable without leaving the workspace", async ({ page }) => {
    const link = page.getByRole("link", { name: /information/i });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", "/challenge");
  });

  /** Requirement 3: the clock stays visible wherever the participant is working. */
  test("shows the same clock on a submission page", async ({ page }) => {
    await page.goto("/challenge/c2");
    await expect(page.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeVisible();
  });
});

test.describe("the clock cannot be cheated", () => {
  /**
   * The one people will actually try. The countdown is anchored to the server's
   * remaining time, so there is no local clock for it to be wrong about.
   */
  test("moving the browser's clock forward does not change the time left", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);

    const timer = page.getByText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(timer).toHaveText(/^02:5\d:\d{2}$/);

    // Jump the page's clock two hours into the future. Overriding Date.now is enough
    // and is exactly the attack: the countdown reads the clock through it, so if the
    // timer were locally driven this would hand the participant two free hours.
    await page.addInitScript(() => {
      const shift = 2 * 60 * 60 * 1000;
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + shift;
    });
    await page.reload();

    // Still roughly three hours, because the server said so.
    await expect(page.getByText(/^\d{2}:\d{2}:\d{2}$/)).toHaveText(/^02:5\d:\d{2}$/);

    await context.close();
  });

  test("the status endpoint is the authority and refuses anonymous callers", async ({
    page,
    browser,
  }) => {
    await loginAsParticipant(page);
    await beginButton(page).click();
    await page.waitForURL(/\/challenge\/run$/);

    const authorised = await page.request.get("/api/attempt/status");
    expect(authorised.ok()).toBe(true);
    const body = await authorised.json();
    expect(body.state).toBe("IN_PROGRESS");
    expect(body.remainingMs).toBeGreaterThan(0);

    const anonymous = await browser.newContext();
    const response = await anonymous.request.get("/api/attempt/status");
    expect(response.status()).toBe(401);
    await anonymous.close();
  });
});
