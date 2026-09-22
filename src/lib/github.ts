/**
 * GitHub repository links for Challenge 3.
 *
 * The brief asks for a public repository whose name contains `wtq26`, for example
 * `storeTask-wtq26`. Two things are checked, and they are deliberately different in
 * strength:
 *
 *   - The shape of the URL and the presence of `wtq26` are validated strictly. Both
 *     are entirely within the participant's control, and getting them wrong is the
 *     kind of mistake that is cheap to catch now and impossible to fix afterwards.
 *   - Whether the repository is actually reachable is only ever a warning. That
 *     depends on GitHub being up and on our rate-limit budget, and a participant must
 *     never lose a submission because a third party had a bad minute (D10).
 */

export const REQUIRED_PHRASE = "wtq26";

export interface ParsedRepo {
  owner: string;
  repo: string;
  /** Canonical form, stored and shown to judges. */
  url: string;
}

export type RepoProblem =
  | "empty"
  | "not_a_url"
  | "not_github"
  | "not_a_repo"
  | "missing_phrase";

export const REPO_PROBLEM_MESSAGES: Record<RepoProblem, string> = {
  empty: "Enter the link to your GitHub repository.",
  not_a_url: "That does not look like a link. It should start with https://github.com/",
  not_github: "The link must point at github.com.",
  not_a_repo:
    "That link does not point at a repository. It should look like https://github.com/your-name/your-repo",
  missing_phrase: `The repository name must contain "${REQUIRED_PHRASE}" — for example, storeTask-${REQUIRED_PHRASE}`,
};

export function parseGithubRepo(input: string): { repo: ParsedRepo } | { problem: RepoProblem } {
  const raw = input.trim();
  if (!raw) return { problem: "empty" };

  // Accept a pasted address without a scheme; a participant typing github.com/x/y
  // has not made a meaningful mistake.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { problem: "not_a_url" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") return { problem: "not_github" };

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return { problem: "not_a_repo" };

  const owner = segments[0];
  // Tolerate a .git suffix and anything after the repo — people paste the URL of
  // whatever page they happen to be looking at.
  const repo = segments[1].replace(/\.git$/i, "");

  if (!owner || !repo) return { problem: "not_a_repo" };
  if (!repo.toLowerCase().includes(REQUIRED_PHRASE)) return { problem: "missing_phrase" };

  return { repo: { owner, repo, url: `https://github.com/${owner}/${repo}` } };
}

/**
 * Best-effort public reachability check.
 *
 * Returns null when we could not tell — a rate limit, a timeout, GitHub being down —
 * which the interface must treat as "unknown", never as "invalid". The only outcome
 * worth acting on is a definite 404, and even then it is a warning.
 */
export async function isRepoPublic(repo: ParsedRepo): Promise<boolean | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      },
    );

    if (response.status === 200) return true;
    if (response.status === 404) return false;

    // 403 is usually the unauthenticated rate limit, which says nothing about the repo.
    return null;
  } catch {
    return null;
  }
}
