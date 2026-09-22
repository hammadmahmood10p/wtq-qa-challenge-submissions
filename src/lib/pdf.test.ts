import { describe, expect, it } from "vitest";
import { safeFilename, validatePdf } from "./pdf";

const MAX = 20 * 1024 * 1024;

function pdf(body = "rest of the file"): Buffer {
  return Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(body)]);
}

describe("validatePdf", () => {
  it("accepts a real PDF", () => {
    expect(validatePdf(pdf(), MAX)).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validatePdf(Buffer.alloc(0), MAX)).toBe("empty");
  });

  it("rejects a file over the cap", () => {
    const oversized = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX)]);
    expect(validatePdf(oversized, MAX)).toBe("too_large");
  });

  /**
   * The whole point of checking the bytes. A renamed file carries a perfectly
   * convincing `.pdf` extension and `application/pdf` content type, both chosen by
   * whoever uploaded it.
   */
  it.each([
    ["HTML", "<html><body>not a pdf</body></html>"],
    ["a script", "#!/bin/sh\nrm -rf /"],
    ["a ZIP", "PK\u0003\u0004"],
    ["plain text", "Dear judge, please accept this"],
  ])("rejects %s regardless of what it is called", (_label, contents) => {
    expect(validatePdf(Buffer.from(contents), MAX)).toBe("not_pdf");
  });

  it("rejects a file with the header somewhere other than the start", () => {
    expect(validatePdf(Buffer.from("junk%PDF-1.7"), MAX)).toBe("not_pdf");
  });
});

describe("safeFilename", () => {
  it("keeps an ordinary name", () => {
    expect(safeFilename("chatbot-evaluation.pdf")).toBe("chatbot-evaluation.pdf");
  });

  it("adds the extension when it is missing", () => {
    expect(safeFilename("report")).toBe("report.pdf");
  });

  /** It is echoed into a Content-Disposition header, so these are injection attempts. */
  it.each([
    ['report".pdf', "report_.pdf"],
    ["report\r\nX-Injected: yes.pdf", "report_X-Injected_ yes.pdf"],
  ])("neutralises %s", (input, expected) => {
    expect(safeFilename(input)).toBe(expected);
  });

  it("strips any path", () => {
    expect(safeFilename("../../../etc/passwd")).toBe("passwd.pdf");
    expect(safeFilename("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
  });

  it("falls back when nothing usable is left", () => {
    expect(safeFilename("")).toBe("submission.pdf");
    expect(safeFilename("...")).toBe("submission.pdf");
    expect(safeFilename("   ")).toBe("submission.pdf");
  });

  it("caps the length", () => {
    expect(safeFilename(`${"a".repeat(500)}.pdf`).length).toBeLessThanOrEqual(124);
  });
});
