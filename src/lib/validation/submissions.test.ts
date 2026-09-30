import { describe, expect, it } from "vitest";
import { parseSubmissionsQuery } from "./submissions";

/**
 * These values arrive from the URL, where a judge can edit them and a stale bookmark
 * can carry yesterday's. Nothing here may throw: the submissions table is the screen
 * judging happens on, and it has to render whatever it is handed.
 */
describe("parseSubmissionsQuery", () => {
  it("defaults everything when the URL is bare", () => {
    const query = parseSubmissionsQuery({});

    expect(query.page).toBe(1);
    expect(query.review).toBe("ALL");
    expect(query.location).toBe("ALL");
    expect(query.challenges).toBe("ALL");
  });

  it("reads each challenge count, including none finished", () => {
    // Zero is the interesting one: it is a real filter value, not an absent one, and
    // it finds the people who handed in nothing complete.
    for (const value of ["0", "1", "2", "3"] as const) {
      expect(parseSubmissionsQuery({ challenges: value }).challenges).toBe(value);
    }
  });

  it("falls back rather than throwing on a count that does not exist", () => {
    // There are three challenges, so 4 is not a filter — and neither is ";drop".
    expect(parseSubmissionsQuery({ challenges: "4" }).challenges).toBe("ALL");
    expect(parseSubmissionsQuery({ challenges: "-1" }).challenges).toBe("ALL");
    expect(parseSubmissionsQuery({ challenges: "three" }).challenges).toBe("ALL");
    expect(parseSubmissionsQuery({ challenges: "" }).challenges).toBe("ALL");
  });

  it("ignores a repeated parameter rather than choking on the array", () => {
    expect(parseSubmissionsQuery({ challenges: ["2", "3"] }).challenges).toBe("ALL");
  });

  it("keeps the other filters working alongside it", () => {
    const query = parseSubmissionsQuery({
      challenges: "2",
      location: "LAHORE",
      review: "REVIEWED",
      page: "3",
    });

    expect(query.challenges).toBe("2");
    expect(query.location).toBe("LAHORE");
    expect(query.review).toBe("REVIEWED");
    expect(query.page).toBe(3);
  });
});
