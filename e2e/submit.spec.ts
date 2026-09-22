import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  E2E_PASSWORD,
  attemptRow,
  cleanupAccounts,
  evaluationRow,
  evaluationRows,
  resetAttempt,
  seedAccounts,
  startAttemptFor,
  userStatus,
} from "./fixtures/accounts";

/**
 * Final submission: the one operation in this product that cannot be undone.
 *
 * Four things must happen together — the attempt seals, the account locks, every
 * session dies, and the work reaches a judge. Half of it applied would mean a
 * participant who has "submitted" but can still type, or a submission nobody will ever
 * review.
 */

test.beforeAll(seedAccounts);
test.afterAll(cleanupAccounts);

async function loginAndStart(page: Page, minutes = 180) {
  await resetAttempt(ACCOUNTS.participant.email);
  await startAttemptFor(ACCOUNTS.participant.email, minutes);

  await page.goto("/login");
  await page.getByLabel("Username").fill(ACCOUNTS.participant.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/challenge/run");
}

function submitButton(page: Page) {
  return page.getByRole("button", { name: /^submit$/i });
}

test.describe("the confirmation dialog", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndStart(page);
  });

  /** Requirement 5: always active, beside the clock. */
  test("is reachable from the workspace and every challenge page", async ({ page }) => {
    await expect(submitButton(page)).toBeEnabled();

    for (const path of ["/challenge/c1", "/challenge/c2", "/challenge/c3"]) {
      await page.goto(path);
      await expect(submitButton(page)).toBeEnabled();
    }
  });

  test("warns that it cannot be undone", async ({ page }) => {
    await submitButton(page).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/are you sure you want to submit everything\?/i);
    await expect(dialog).toContainText(/not be able to submit again/i);
    await expect(dialog).toContainText(/no way back to the challenges/i);
  });

  test("Cancel changes nothing at all", async ({ page }) => {
    await submitButton(page).click();
    await page.getByRole("button", { name: /^cancel$/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/challenge\/run$/);

    const attempt = await attemptRow(ACCOUNTS.participant.email);
    expect(attempt?.state).toBe("IN_PROGRESS");
    expect(await userStatus(ACCOUNTS.participant.email)).toBe("ACTIVE");
  });
});

test.describe("confirming", () => {
  test("seals the attempt, locks the account and assigns a judge", async ({ page }) => {
    await loginAndStart(page);

    await submitButton(page).click();
    await page.getByRole("button", { name: /^confirm$/i }).click();

    await page.waitForURL(/\/submitted/);
    await expect(page.getByRole("heading", { name: /thank you/i })).toBeVisible();

    const attempt = await attemptRow(ACCOUNTS.participant.email);
    expect(attempt?.state).toBe("SUBMITTED");
    expect(attempt?.submittedAt).toBeTruthy();
    expect(attempt?.autoSubmitted).toBe(false);

    // Requirement 5: the account is closed.
    expect(await userStatus(ACCOUNTS.participant.email)).toBe("SUBMITTED_LOCKED");

    // D3: assigned on submission, so a judge opens the app to their own queue.
    const evaluation = await evaluationRow(ACCOUNTS.participant.email);
    expect(evaluation?.judgeId).toBeTruthy();
    expect(evaluation?.status).toBe("ASSIGNED");
  });

  test("signs the participant out, and they cannot get back in", async ({ page }) => {
    await loginAndStart(page);

    await submitButton(page).click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await page.waitForURL(/\/submitted/);

    // The session died with the submission.
    await page.goto("/challenge/run");
    await expect(page).toHaveURL(/\/login/);

    // And the account itself is closed.
    await page.getByLabel("Username").fill(ACCOUNTS.participant.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page.locator("form").getByRole("alert").first()).toContainText(
      /already submitted/i,
    );
  });

  /**
   * Two tabs pressing Confirm at once, or a replayed request, must not produce two
   * evaluations. The guard is a WHERE clause, not the button's disabled state.
   */
  test("cannot be sealed twice", async ({ page }) => {
    await loginAndStart(page);

    await submitButton(page).click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await page.waitForURL(/\/submitted/);

    const first = await attemptRow(ACCOUNTS.participant.email);
    expect(first?.submittedAt).toBeTruthy();

    // Every request that touches the attempt re-runs the finalisation path, so
    // revisiting it is a genuine replay. Nothing may move a second time: not the
    // timestamp, and not the number of evaluations a judge will be shown.
    for (const path of ["/challenge/run", "/challenge/c1", "/submitted"]) {
      await page.goto(path);
    }

    const after = await attemptRow(ACCOUNTS.participant.email);
    expect(after?.submittedAt).toEqual(first?.submittedAt);
    expect(after?.autoSubmitted).toBe(false);

    expect(await evaluationRows(ACCOUNTS.participant.email)).toHaveLength(1);
  });
});

/** D13: the other tabs must not keep showing a running clock and a live form. */
test.describe("other tabs", () => {
  test("are sent to the closing page when one of them submits", async ({ page, context }) => {
    await loginAndStart(page);

    const other = await context.newPage();
    await other.goto("/challenge/c1");
    await expect(other.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeVisible();

    await submitButton(page).click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await page.waitForURL(/\/submitted/);

    // Told directly by the submitting tab, rather than waiting for a poll.
    await other.waitForURL(/\/submitted/, { timeout: 15_000 });

    await other.close();
  });
});

/** D1: at zero, whatever was saved is submitted — the same state, by a different route. */
test.describe("running out of time", () => {
  test("auto-submits and locks the account", async ({ page }) => {
    // A minute on the clock, then wound past the end behind the page's back.
    await loginAndStart(page, 1);
    await expect(page.getByText(/^00:0[01]:\d{2}$/)).toBeVisible();

    await resetAttempt(ACCOUNTS.participant.email);
    await startAttemptFor(ACCOUNTS.participant.email, -1);

    await page.goto("/challenge/run");
    await expect(page).toHaveURL(/\/submitted/);

    const attempt = await attemptRow(ACCOUNTS.participant.email);
    expect(attempt?.state).toBe("SUBMITTED");
    expect(attempt?.autoSubmitted).toBe(true);
    expect(await userStatus(ACCOUNTS.participant.email)).toBe("SUBMITTED_LOCKED");

    // An expired attempt still holds work worth reading, so it is assigned like any
    // other.
    const evaluation = await evaluationRow(ACCOUNTS.participant.email);
    expect(evaluation?.judgeId).toBeTruthy();
  });
});
