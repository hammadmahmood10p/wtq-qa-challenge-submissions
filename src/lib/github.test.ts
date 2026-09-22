import { describe, expect, it } from "vitest";
import { parseGithubRepo } from "./github";

function repoOf(input: string) {
  const result = parseGithubRepo(input);
  return "repo" in result ? result.repo : null;
}

function problemOf(input: string) {
  const result = parseGithubRepo(input);
  return "problem" in result ? result.problem : null;
}

describe("parseGithubRepo", () => {
  it("accepts the canonical form", () => {
    expect(repoOf("https://github.com/ayesha/storeTask-wtq26")).toEqual({
      owner: "ayesha",
      repo: "storeTask-wtq26",
      url: "https://github.com/ayesha/storeTask-wtq26",
    });
  });

  /**
   * People paste whatever page they happen to be looking at, and under time pressure
   * they will not tidy it up. Every one of these is the right repository.
   */
  it.each([
    ["no scheme", "github.com/ayesha/storeTask-wtq26"],
    ["http", "http://github.com/ayesha/storeTask-wtq26"],
    ["www", "https://www.github.com/ayesha/storeTask-wtq26"],
    ["trailing slash", "https://github.com/ayesha/storeTask-wtq26/"],
    ["clone URL", "https://github.com/ayesha/storeTask-wtq26.git"],
    ["a deep link", "https://github.com/ayesha/storeTask-wtq26/tree/main/features"],
    ["surrounding spaces", "  https://github.com/ayesha/storeTask-wtq26  "],
  ])("normalises %s", (_label, input) => {
    expect(repoOf(input)?.url).toBe("https://github.com/ayesha/storeTask-wtq26");
  });

  it("requires the wtq26 phrase in the repository name", () => {
    expect(problemOf("https://github.com/ayesha/storeTask")).toBe("missing_phrase");
    expect(problemOf("https://github.com/ayesha/my-project")).toBe("missing_phrase");
  });

  it("matches the phrase whatever the casing", () => {
    expect(repoOf("https://github.com/ayesha/StoreTask-WTQ26")).not.toBeNull();
  });

  /**
   * The phrase has to be in the repository name, not anywhere in the URL — otherwise
   * a participant whose username contains it would pass without naming the repo
   * correctly.
   */
  it("does not accept the phrase appearing only in the owner name", () => {
    expect(problemOf("https://github.com/wtq26-user/storeTask")).toBe("missing_phrase");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["not a link at all", "not_a_url"],
    ["https://gitlab.com/ayesha/storeTask-wtq26", "not_github"],
    ["https://github.com/ayesha", "not_a_repo"],
    ["https://github.com/", "not_a_repo"],
  ])("rejects %s", (input, expected) => {
    expect(problemOf(input)).toBe(expected);
  });

  it("is not fooled by a lookalike host", () => {
    expect(problemOf("https://github.com.attacker.io/a/b-wtq26")).toBe("not_github");
  });
});
