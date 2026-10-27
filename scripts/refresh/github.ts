// GitHub access for the `github` and `ci` readers. The token comes from GITHUB_TOKEN, or from the GitHub CLI when
// that's signed in. Reads only; the four repositories are public.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const API = "https://api.github.com";

let tokenPromise: Promise<string> | undefined;

/** GITHUB_TOKEN, or `gh auth token`. Throws when neither is there. */
export function githubToken(): Promise<string> {
  tokenPromise ??= (async () => {
    const env = process.env.GITHUB_TOKEN?.trim();
    if (env) return env;
    try {
      const { stdout } = await promisify(execFile)("gh", ["auth", "token"]);
      if (stdout.trim()) return stdout.trim();
    } catch {
      // Not installed or not signed in: the error below says what to do.
    }
    throw new Error(
      "no GitHub token: set GITHUB_TOKEN or sign in with `gh auth login`",
    );
  })();
  return tokenPromise;
}

async function request(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${await githubToken()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "azamatos-portfolio-refresh",
      ...init.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`GitHub answered ${res.status} for ${url}: ${body}`);
  }
  return res;
}

/** A REST call; `path` starts with `/repos/…`. */
export async function rest<T>(path: string): Promise<T> {
  return (await request(API + path)).json() as Promise<T>;
}

/** A REST call that answers with text, after any redirect (job logs). */
export async function restText(path: string): Promise<string> {
  return (await request(API + path)).text();
}

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await request(`${API}/graphql`, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: { "content-type": "application/json" },
  });
  const body = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length)
    throw new Error(
      `GitHub GraphQL: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  if (!body.data) throw new Error("GitHub GraphQL: no data");
  return body.data;
}
