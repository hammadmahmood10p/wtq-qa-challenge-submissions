import { describe, expect, it } from "vitest";
import { CSV_MAX_BYTES, previewCsv, safeCsvFilename, validateCsv } from "./csv";

const buf = (s: string) => Buffer.from(s, "utf8");

describe("validateCsv", () => {
  it("accepts an ordinary comma-separated file", () => {
    expect(validateCsv(buf("id,title,steps\n1,Login,Open the page\n"))).toBeNull();
  });

  it("accepts the delimiters a European export actually uses", () => {
    // Excel in many locales writes semicolons. Rejecting these would be a self-
    // inflicted failure on event morning.
    expect(validateCsv(buf("id;title;steps\n1;Login;Open\n"))).toBeNull();
    expect(validateCsv(buf("id\ttitle\tsteps\n1\tLogin\tOpen\n"))).toBeNull();
  });

  it("accepts a single column with no delimiter at all", () => {
    expect(validateCsv(buf("title\nLogin works\nCheckout works\n"))).toBeNull();
  });

  it("accepts a UTF-8 BOM, which Excel adds unasked", () => {
    expect(validateCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf("a,b\n1,2\n")]))).toBeNull();
  });

  it("accepts non-ASCII content", () => {
    expect(validateCsv(buf("id,title\n1,تسجيل الدخول\n"))).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateCsv(Buffer.alloc(0))).toBe("empty");
  });

  it("rejects anything past the size cap", () => {
    expect(validateCsv(Buffer.alloc(CSV_MAX_BYTES + 1, 0x61))).toBe("too_large");
  });

  it("names a spreadsheet as a spreadsheet, not as junk", () => {
    // .xlsx and .ods are zip archives; .xls is an OLE compound document. Someone
    // will rename one to .csv, and the message should tell them how to export.
    const xlsx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), buf("rest")]);
    const xls = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), buf("rest")]);

    expect(validateCsv(xlsx)).toBe("spreadsheet");
    expect(validateCsv(xls)).toBe("spreadsheet");
  });

  it("rejects a PDF picked by mistake", () => {
    expect(validateCsv(buf("%PDF-1.7\nnot a csv"))).toBe("binary");
  });

  it("rejects anything with a NUL byte in it", () => {
    expect(validateCsv(Buffer.concat([buf("id,title\n"), Buffer.from([0x00]), buf("x")]))).toBe(
      "binary",
    );
  });

  it("does not scan the whole file looking for binary", () => {
    // Only the first 8KB is checked, so a large legitimate file stays cheap. A NUL
    // past that point is accepted, which is the deliberate trade.
    const big = Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0x00])]);
    expect(validateCsv(big)).toBeNull();
  });
});

describe("safeCsvFilename", () => {
  it("keeps an ordinary name", () => {
    expect(safeCsvFilename("challenge-4-cases.csv")).toBe("challenge-4-cases.csv");
  });

  it("appends the extension when it is missing", () => {
    expect(safeCsvFilename("testcases")).toBe("testcases.csv");
  });

  it("strips directory components", () => {
    expect(safeCsvFilename("C:\\Users\\me\\cases.csv")).toBe("cases.csv");
    expect(safeCsvFilename("../../etc/passwd")).toBe("passwd.csv");
  });

  it("removes characters that could break a Content-Disposition header", () => {
    const cleaned = safeCsvFilename('we"ird\nname.csv');
    expect(cleaned).not.toMatch(/["\n]/);
    expect(cleaned.endsWith(".csv")).toBe(true);
  });

  it("falls back when the name has nothing usable in it", () => {
    expect(safeCsvFilename("....")).toBe("challenge4.csv");
    expect(safeCsvFilename("   ")).toBe("challenge4.csv");
  });
});

describe("previewCsv", () => {
  it("returns the first few non-blank lines", () => {
    expect(previewCsv(buf("a,b\n\n1,2\n3,4\n5,6\n"), 3)).toEqual(["a,b", "1,2", "3,4"]);
  });

  it("strips the BOM so the header does not start with a stray glyph", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf("id,title\n1,x\n")]);
    expect(previewCsv(withBom)[0]).toBe("id,title");
  });

  it("truncates a very long line rather than flooding the page", () => {
    const line = "x".repeat(500);
    const [first] = previewCsv(buf(line));
    expect(first.length).toBeLessThan(200);
    expect(first.endsWith("…")).toBe(true);
  });
});
