import { describe, expect, it } from "vitest";
import {
  challengeNumber,
  exportArchiveName,
  exportFilename,
  isExportableChallenge,
} from "./submission-export";

const name = (over: Partial<Parameters<typeof exportFilename>[0]> = {}) =>
  exportFilename({
    idCardNumber: "42101-1234567-8",
    fullName: "Hammad Mahmood",
    challenge: "C2",
    ...over,
  });

describe("exportFilename", () => {
  it("is the format the organisers asked for", () => {
    expect(name()).toBe("45678-HammadMahmood-Challenge-2.pdf");
  });

  it("takes the last five digits however the CNIC was typed", () => {
    // Stored encrypted and formatted on the way out, but the dashes should not be
    // load-bearing — one import path writes them and another does not.
    expect(name({ idCardNumber: "4210112345678" })).toBe("45678-HammadMahmood-Challenge-2.pdf");
    expect(name({ idCardNumber: "42101 1234567 8" })).toBe("45678-HammadMahmood-Challenge-2.pdf");
  });

  it("closes up the full name so the file is one token", () => {
    expect(name({ fullName: "Syed Mohsin Ali" })).toBe("45678-SyedMohsinAli-Challenge-2.pdf");
  });

  it("names the challenge it came from", () => {
    expect(name({ challenge: "C3" })).toBe("45678-HammadMahmood-Challenge-3.pdf");
  });

  it("survives a CNIC shorter than five digits rather than producing a bare dash", () => {
    // Should not happen — the schema requires thirteen — but a filename of "-Name-"
    // in a folder of five hundred is a bug somebody would have to chase.
    expect(name({ idCardNumber: "7" })).toBe("7-HammadMahmood-Challenge-2.pdf");
    expect(name({ idCardNumber: "" })).toBe("00000-HammadMahmood-Challenge-2.pdf");
  });

  it("survives a blank name", () => {
    expect(name({ fullName: "   " })).toBe("45678-Unnamed-Challenge-2.pdf");
  });

  it("keeps the extension, so the file opens by double-click", () => {
    expect(name().endsWith(".pdf")).toBe(true);
  });
});

describe("isExportableChallenge", () => {
  it("accepts the two challenges that take an uploaded report", () => {
    expect(isExportableChallenge("C2")).toBe(true);
    expect(isExportableChallenge("C3")).toBe(true);
  });

  it("refuses the ones that do not", () => {
    // Challenge 1 is written into the application; Challenge 4 is a repository link.
    expect(isExportableChallenge("C1")).toBe(false);
    expect(isExportableChallenge("C4")).toBe(false);
    expect(isExportableChallenge("../../etc")).toBe(false);
    expect(isExportableChallenge("")).toBe(false);
  });
});

describe("challengeNumber", () => {
  it("reads the number out of the key", () => {
    expect(challengeNumber("C2")).toBe(2);
    expect(challengeNumber("C3")).toBe(3);
  });
});

describe("exportArchiveName", () => {
  it("is dated, because these get kept", () => {
    expect(exportArchiveName("C2", new Date("2026-10-10T09:00:00Z"))).toBe(
      "WTQ2026-Challenge-2-Submissions-2026-10-10.zip",
    );
  });
});
