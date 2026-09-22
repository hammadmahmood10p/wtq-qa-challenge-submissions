import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  E2E_PASSWORD,
  challenge1Titles,
  cleanupAccounts,
  closeAttempt,
  resetAttempt,
  seedAccounts,
  startAttemptFor,
} from "./fixtures/accounts";

/**
 * Challenge 1 is where a participant spends most of three hours. Losing what they
 * typed is the single worst thing this application could do, so most of what is
 * tested here is that the text survives.
 */

test.beforeAll(seedAccounts);
test.afterAll(cleanupAccounts);

test.beforeEach(async ({ page }) => {
  await resetAttempt(ACCOUNTS.participant.email);
  await startAttemptFor(ACCOUNTS.participant.email);

  await page.goto("/login");
  await page.getByLabel("Username").fill(ACCOUNTS.participant.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/challenge/c1");
});

/**
 * The autosave badge.
 *
 * Matched exactly and by role. `getByText("Saved")` is case-insensitive substring
 * matching by default, so it also matched the page hint "saved automatically as you
 * go" — every wait-for-save returned instantly and the assertions that followed raced
 * the 900ms debounce.
 */
function savedBadge(page: Page) {
  return page.getByRole("status").filter({ hasText: /^Saved$/ }).first();
}

function drawer(page: Page, index: number) {
  const titles = page.getByLabel("Title");
  const descriptions = page.getByLabel("Description");
  return { title: titles.nth(index), description: descriptions.nth(index) };
}

/**
 * Adds a bug report and, optionally, fills its title.
 *
 * It waits for the new drawer to exist before touching anything. Counting the fields
 * before the render lands means filling the *previous* drawer and silently
 * overwriting it — which looked exactly like a persistence bug when it was not.
 */
async function addBugReport(page: Page, title?: string) {
  const titles = page.getByLabel("Title");
  const before = await titles.count();

  const first = page.getByRole("button", { name: "Add Bug Report" });
  if (await first.isVisible().catch(() => false)) {
    await first.click();
  } else {
    await page.getByRole("button", { name: "Add Another Bug Report" }).click();
  }

  await expect(titles).toHaveCount(before + 1);
  if (title !== undefined) await titles.nth(before).fill(title);
}

test.describe("the two sections", () => {
  test("offers bug reports and test cases", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bug Reports" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test Cases" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Bug Report" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Test Case" })).toBeVisible();
  });

  /** The brief is specific: the add button sits outside the expanded drawer. */
  test("offers Add Another once the first drawer exists", async ({ page }) => {
    await addBugReport(page);
    await expect(page.getByRole("button", { name: "Add Another Bug Report" })).toBeVisible();
  });

  test("keeps the two sections independent", async ({ page }) => {
    await addBugReport(page);
    await page.getByRole("button", { name: "Add Test Case" }).click();

    await drawer(page, 0).title.fill("A bug");
    await drawer(page, 1).title.fill("A test case");

    await page.reload();
    await expect(drawer(page, 0).title).toHaveValue("A bug");
    await expect(drawer(page, 1).title).toHaveValue("A test case");
  });
});

test.describe("autosave", () => {
  test("saves without pressing anything, and survives a reload", async ({ page }) => {
    await addBugReport(page);

    await drawer(page, 0).title.fill("Checkout accepts a negative quantity");
    await drawer(page, 0).description.fill("Steps:\n1. Add an item\n2. Set quantity to -1");

    // The indicator is the participant's only evidence their work is safe.
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(drawer(page, 0).title).toHaveValue("Checkout accepts a negative quantity");
    await expect(drawer(page, 0).description).toHaveValue(
      "Steps:\n1. Add an item\n2. Set quantity to -1",
    );
  });

  test("the explicit Save button confirms immediately", async ({ page }) => {
    await addBugReport(page);
    await drawer(page, 0).title.fill("Saved on demand");

    await page.getByRole("button", { name: "Save Bug Report" }).first().click();
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(drawer(page, 0).title).toHaveValue("Saved on demand");
  });

  /**
   * The failure that would cost a participant three hours: navigating away, or a tab
   * crash, moments after typing. Whatever reached the server must already be durable.
   */
  test("keeps work typed right before leaving the page", async ({ page }) => {
    await addBugReport(page);
    await drawer(page, 0).title.fill("Typed then left");
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });

    await page.goto("/challenge/run");
    await page.goto("/challenge/c1");
    await expect(drawer(page, 0).title).toHaveValue("Typed then left");
  });
});

test.describe("managing entries", () => {
  test("adds several and keeps them in order", async ({ page }) => {
    for (const title of ["First", "Second", "Third"]) {
      await addBugReport(page, title);
    }
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(drawer(page, 0).title).toHaveValue("First");
    await expect(drawer(page, 1).title).toHaveValue("Second");
    await expect(drawer(page, 2).title).toHaveValue("Third");
  });

  test("reorders and the new order persists", async ({ page }) => {
    for (const title of ["First", "Second"]) {
      await addBugReport(page, title);
    }
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Move Bug Report 2 up" }).click();
    await expect(drawer(page, 0).title).toHaveValue("Second");

    // Assert the server agrees before reloading, so a failure here says whether the
    // reorder was never persisted or merely rendered back in the old order.
    await expect
      .poll(() => challenge1Titles(ACCOUNTS.participant.email), { timeout: 10_000 })
      .toEqual(["Second", "First"]);

    await page.reload();
    await expect(drawer(page, 0).title).toHaveValue("Second");
    await expect(drawer(page, 1).title).toHaveValue("First");
  });

  test("deletes only after confirming", async ({ page }) => {
    // Deliberately avoids the word "delete": the drawer's toggle button is named after
    // the entry's title, and getByRole name matching is substring and case-insensitive,
    // so a title like "To be deleted" makes the toggle match a search for "Delete" —
    // collapsing the drawer instead of deleting anything.
    await addBugReport(page, "Temporary entry");
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });

    const drawerBody = page.locator('[id^="drawer-"]').first();

    await drawerBody.getByRole("button", { name: "Delete", exact: true }).click();
    // Still there until confirmed.
    await expect(page.getByText(/delete this bug report\?/i)).toBeVisible();
    await expect(drawer(page, 0).title).toHaveValue("Temporary entry");

    await drawerBody.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByLabel("Title")).toHaveCount(0);

    await expect
      .poll(() => challenge1Titles(ACCOUNTS.participant.email), { timeout: 10_000 })
      .toEqual([]);

    await page.reload();
    await expect(page.getByLabel("Title")).toHaveCount(0);
  });
});

test.describe("the attempt is the authority", () => {
  /**
   * The guard that matters most. A tab left open past the deadline must not be able to
   * keep writing, whatever its interface still offers.
   */
  test("refuses saves once the attempt has closed", async ({ page }) => {
    await addBugReport(page);
    await drawer(page, 0).title.fill("Before the end");
    await expect(savedBadge(page)).toBeVisible({ timeout: 10_000 });
    expect(await challenge1Titles(ACCOUNTS.participant.email)).toEqual(["Before the end"]);

    // End the attempt behind the page's back — exactly what the clock running out, or
    // another tab submitting, looks like from here. The work stays; only writing stops.
    await closeAttempt(ACCOUNTS.participant.email);

    // The open page has no idea, so this is a genuine post-close write attempt.
    await drawer(page, 0).title.fill("After the end");
    await page.waitForTimeout(3000);

    // The server refused it. A disabled button would not have.
    expect(await challenge1Titles(ACCOUNTS.participant.email)).toEqual(["Before the end"]);
  });

  test("sends a participant away from a closed attempt", async ({ page }) => {
    await closeAttempt(ACCOUNTS.participant.email);
    await page.goto("/challenge/c1");
    await expect(page).toHaveURL(/\/challenge\/done$/);
  });
});
