import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  E2E_PASSWORD,
  cleanupAccounts,
  evaluationRow,
  seedAccounts,
  seedSubmission,
} from "./fixtures/accounts";

/**
 * Participants Submission Details, and the review page behind it.
 *
 * Judging happens the same afternoon as the event (§1), so these screens are used
 * under exactly the same time pressure as the challenge itself.
 */

test.beforeAll(async () => {
  await seedAccounts();
  // Three sealed submissions with scores already set, so sorting has something to sort.
  await seedSubmission(ACCOUNTS.participant.email, { score: 42, reviewed: true });
  await seedSubmission(ACCOUNTS.blocked.email, { score: 88, reviewed: true });
  await seedSubmission(ACCOUNTS.locked.email, { reviewed: false });
});

test.afterAll(cleanupAccounts);

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

function scoreCells(page: Page) {
  // Sixth column: ID card, name, location, submission, review status, score.
  return page.getByRole("row").locator("td:nth-child(6)");
}

test.describe("the submissions table", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin.email);
    await page.goto("/admin/submissions");
  });

  /** The columns the brief lists, in the order it lists them. */
  test("shows every required column", async ({ page }) => {
    for (const heading of [
      "ID card number",
      "Full name",
      "Location",
      "Submission",
      "Review status",
      "Score",
      "Judge",
    ]) {
      await expect(page.getByRole("columnheader", { name: heading })).toBeVisible();
    }
  });

  test("shows a participant's details from their signup", async ({ page }) => {
    const row = page.getByRole("row").filter({ hasText: ACCOUNTS.participant.fullName });
    await expect(row).toContainText("42101-5555555-1");
    await expect(row).toContainText("Karachi");
    await expect(row).toContainText("Reviewed");
    await expect(row).toContainText("42");
  });

  /** The brief is explicit: the score column shows nothing before a review. */
  test("leaves the score empty until the review is finalised", async ({ page }) => {
    const row = page.getByRole("row").filter({ hasText: ACCOUNTS.locked.fullName });
    await expect(row).toContainText("Not reviewed");

    // Scoped to the score cell: the row also carries an ID card number, which is
    // nothing but digits.
    await expect(row.locator("td:nth-child(6)")).toHaveText("—");
  });

  /** Requirement 7. */
  test("sorts by score, both ways", async ({ page }) => {
    await page.getByRole("button", { name: /^score$/i }).click();
    await expect(page).toHaveURL(/sort=score/);

    // Highest first, and unscored submissions sink rather than interleave.
    await expect(scoreCells(page).first()).toContainText("88");

    await page.getByRole("button", { name: /^score$/i }).click();
    await expect(page).toHaveURL(/dir=asc/);
    await expect(scoreCells(page).first()).toContainText("42");
  });

  test("keeps the sort in the URL so a view can be shared", async ({ page }) => {
    await page.goto("/admin/submissions?sort=score&dir=desc");
    await expect(scoreCells(page).first()).toContainText("88");
  });

  test("filters by review status", async ({ page }) => {
    await page.getByLabel("Filter by review status").selectOption("NOT_REVIEWED");
    await expect(page.getByRole("row").filter({ hasText: ACCOUNTS.locked.fullName })).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: ACCOUNTS.participant.fullName }),
    ).toHaveCount(0);
  });

  test("filters by city", async ({ page }) => {
    await page.getByLabel("Filter by location").selectOption("KARACHI");
    await expect(
      page.getByRole("row").filter({ hasText: ACCOUNTS.participant.fullName }),
    ).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: ACCOUNTS.blocked.fullName })).toHaveCount(
      0,
    );
  });

  /** Requirement: a new tab, so a judge working down a list does not lose their place. */
  test("links to the submission in a new tab", async ({ page }) => {
    const row = page.getByRole("row").filter({ hasText: ACCOUNTS.participant.fullName });
    const link = row.getByRole("link", { name: /view submission/i });

    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", /^\/review\//);
  });
});

test.describe("the judge's queue", () => {
  test("defaults to their own submissions and can show all", async ({ page }) => {
    await loginAs(page, ACCOUNTS.judge.email);
    await expect(page).toHaveURL(/\/judge$/);

    await expect(page.getByRole("heading", { name: /participants submission details/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /my queue/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: /all submissions/i }).first().click();
    await expect(page).toHaveURL(/scope=all/);
  });
});

test.describe("the review page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.judge.email);
    const evaluation = await evaluationRow(ACCOUNTS.participant.email);
    await page.goto(`/review/${evaluation!.attemptId}`);
  });

  test("identifies the participant and shows the total at the top", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: ACCOUNTS.participant.fullName }),
    ).toBeVisible();
    await expect(page.getByText("42101-5555555-1")).toBeVisible();
    await expect(page.getByText(/total score/i)).toBeVisible();
  });

  /** Judge requirement 4: three sub-tabs, one per task. */
  test("has three task tabs, navigable by keyboard", async ({ page }) => {
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);

    await expect(page.getByRole("tab", { selected: true })).toContainText("Task 1");

    await page.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Task 2");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toContainText("Task 3");
  });

  test("shows the participant's work, read only", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bug Reports" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test Cases" })).toBeVisible();
    await expect(page.getByText("Checkout accepts a negative quantity")).toBeVisible();

    // A judge must not be able to alter what a participant wrote.
    await expect(page.getByLabel("Title")).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveCount(0);
  });

  test("offers the PDF for reading and the repository as a link", async ({ page }) => {
    await page.getByRole("tab", { name: /task 2/i }).click();
    const view = page.getByRole("link", { name: /view file/i });
    await expect(view).toHaveAttribute("target", "_blank");
    await expect(view).toHaveAttribute("href", /\/api\/files\/challenge2\//);

    await page.getByRole("tab", { name: /task 3/i }).click();
    const repo = page.getByRole("link", { name: /open repository/i });
    await expect(repo).toHaveAttribute("target", "_blank");
    await expect(repo).toHaveAttribute("href", /github\.com/);
  });

  test("answers not found for an attempt that does not exist", async ({ page }) => {
    const response = await page.goto("/review/00000000-0000-0000-0000-000000000000");
    expect(response?.status()).toBe(404);
  });
});

test.describe("who can reach the review screens", () => {
  test("a participant cannot", async ({ page }) => {
    await loginAs(page, ACCOUNTS.participant.email);
    const evaluation = await evaluationRow(ACCOUNTS.participant.email);

    await page.goto(`/review/${evaluation!.attemptId}`);
    await expect(page).not.toHaveURL(/\/review\//);

    await page.goto("/judge");
    await expect(page).not.toHaveURL(/\/judge/);
  });

  test("an anonymous visitor cannot", async ({ page }) => {
    const evaluation = await evaluationRow(ACCOUNTS.participant.email);
    await page.goto(`/review/${evaluation!.attemptId}`);
    await expect(page).toHaveURL(/\/login/);
  });
});
