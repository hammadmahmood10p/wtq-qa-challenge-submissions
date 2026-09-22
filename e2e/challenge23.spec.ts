import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  E2E_PASSWORD,
  challenge2Row,
  challenge3Row,
  cleanupAccounts,
  closeAttempt,
  resetAttempt,
  seedAccounts,
  startAttemptFor,
} from "./fixtures/accounts";

/**
 * Challenge 2 (a PDF report) and Challenge 3 (a GitHub repository link).
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
});

/** A minimal but genuine PDF: the magic header is what validation actually checks. */
function pdfBytes(body = "e2e report"): Buffer {
  return Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(body), Buffer.from("\n%%EOF")]);
}

async function upload(page: Page, name: string, contents: Buffer, mimeType = "application/pdf") {
  await page.setInputFiles("#challenge2-file", { name, mimeType, buffer: contents });
  await page.getByRole("button", { name: /save/i }).click();
}

test.describe("Challenge 2 — the PDF report", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/challenge/c2");
  });

  test("uploads a PDF and confirms it is stored", async ({ page }) => {
    await upload(page, "chatbot-evaluation.pdf", pdfBytes());

    await expect(page.getByText(/your report is uploaded/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("chatbot-evaluation.pdf")).toBeVisible();

    const row = await challenge2Row(ACCOUNTS.participant.email);
    expect(row?.originalFilename).toBe("chatbot-evaluation.pdf");
    expect(row?.contentType).toBe("application/pdf");
    expect(Number(row?.sizeBytes)).toBeGreaterThan(0);
  });

  test("survives a reload", async ({ page }) => {
    await upload(page, "report.pdf", pdfBytes());
    await expect(page.getByText(/your report is uploaded/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText("report.pdf")).toBeVisible();
  });

  /**
   * The check that matters. The filename and the declared content type are both chosen
   * by whoever uploads, so neither is evidence — only the file's own leading bytes are.
   */
  test("rejects a file that is merely named .pdf", async ({ page }) => {
    await upload(page, "definitely-a-report.pdf", Buffer.from("<html>not a pdf</html>"));

    await expect(page.getByText(/is not a PDF/i)).toBeVisible({ timeout: 15_000 });
    expect(await challenge2Row(ACCOUNTS.participant.email)).toBeNull();
  });

  test("asks for a file when none was chosen", async ({ page }) => {
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/choose a pdf file/i)).toBeVisible({ timeout: 15_000 });
  });

  /** D9: one file per participant, replaced on re-upload. */
  test("replaces an earlier upload rather than adding a second", async ({ page }) => {
    await upload(page, "first.pdf", pdfBytes("first"));
    await expect(page.getByText("first.pdf")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /replace and save/i })).toBeVisible();

    await upload(page, "second.pdf", pdfBytes("second draft, longer"));

    // Polls the stored row rather than the rendered name: the picker remounts on a
    // successful save, so the DOM briefly holds neither filename.
    await expect
      .poll(async () => (await challenge2Row(ACCOUNTS.participant.email))?.originalFilename, {
        timeout: 20_000,
      })
      .toBe("second.pdf");
  });

  test("opens the stored PDF for reading rather than downloading it", async ({ page }) => {
    await upload(page, "viewable.pdf", pdfBytes());
    await expect(page.getByText(/your report is uploaded/i)).toBeVisible({ timeout: 15_000 });

    const row = await challenge2Row(ACCOUNTS.participant.email);
    const response = await page.request.get(`/api/files/challenge2/${row!.attemptId}`);

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("pdf");
    // Requirement: the judge reads it in the browser, so it must not be an attachment.
    expect(response.headers()["content-disposition"] ?? "inline").toContain("inline");
  });

  test("refuses the file to someone not signed in", async ({ page, browser }) => {
    await upload(page, "private.pdf", pdfBytes());
    await expect(page.getByText(/your report is uploaded/i)).toBeVisible({ timeout: 15_000 });

    const row = await challenge2Row(ACCOUNTS.participant.email);

    const anonymous = await browser.newContext();
    const response = await anonymous.request.get(`/api/files/challenge2/${row!.attemptId}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(401);
    await anonymous.close();
  });
});

test.describe("Challenge 3 — the repository link", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/challenge/c3");
  });

  async function save(page: Page, url: string) {
    await page.getByLabel("GitHub repository link").fill(url);
    await page.getByRole("button", { name: /^save$/i }).click();
  }

  test("saves a well-formed repository link", async ({ page }) => {
    await save(page, "https://github.com/ayesha/storeTask-wtq26");

    await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible({
      timeout: 15_000,
    });

    const row = await challenge3Row(ACCOUNTS.participant.email);
    expect(row?.githubUrl).toBe("https://github.com/ayesha/storeTask-wtq26");
  });

  test("normalises what was pasted", async ({ page }) => {
    await save(page, "  github.com/ayesha/storeTask-wtq26/tree/main  ");

    await expect
      .poll(
        async () => (await challenge3Row(ACCOUNTS.participant.email))?.githubUrl,
        { timeout: 15_000 },
      )
      .toBe("https://github.com/ayesha/storeTask-wtq26");
  });

  /** The phrase is the whole point of the naming rule, so it is enforced strictly. */
  test("refuses a repository without the wtq26 phrase", async ({ page }) => {
    await save(page, "https://github.com/ayesha/storeTask");

    await expect(page.getByText(/must contain "wtq26"/i)).toBeVisible({ timeout: 15_000 });
    expect(await challenge3Row(ACCOUNTS.participant.email)).toBeNull();
  });

  test("refuses a link that is not GitHub", async ({ page }) => {
    await save(page, "https://gitlab.com/ayesha/storeTask-wtq26");
    await expect(page.getByText(/must point at github\.com/i)).toBeVisible({ timeout: 15_000 });
  });

  test("keeps the saved link after a reload", async ({ page }) => {
    await save(page, "https://github.com/ayesha/storeTask-wtq26");
    await expect
      .poll(async () => (await challenge3Row(ACCOUNTS.participant.email))?.githubUrl, {
        timeout: 15_000,
      })
      .toBeTruthy();

    await page.reload();
    await expect(page.getByLabel("GitHub repository link")).toHaveValue(
      "https://github.com/ayesha/storeTask-wtq26",
    );
  });
});

test.describe("both refuse writes once the attempt has closed", () => {
  test("Challenge 2", async ({ page }) => {
    await page.goto("/challenge/c2");
    await closeAttempt(ACCOUNTS.participant.email);

    await upload(page, "too-late.pdf", pdfBytes());
    await page.waitForTimeout(2000);

    expect(await challenge2Row(ACCOUNTS.participant.email)).toBeNull();
  });

  test("Challenge 3", async ({ page }) => {
    await page.goto("/challenge/c3");
    await closeAttempt(ACCOUNTS.participant.email);

    await page.getByLabel("GitHub repository link").fill("https://github.com/a/b-wtq26");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForTimeout(2000);

    expect(await challenge3Row(ACCOUNTS.participant.email)).toBeNull();
  });
});
