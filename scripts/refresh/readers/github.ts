// `github` values: one GraphQL query per project reads the commit count, the last commit, every file a version
// comes from and every directory a file count needs.

import { graphql } from "../github.ts";
import { parseYaml } from "../config.ts";
import type { Def, Reading } from "./types.ts";

type Commit = {
  oid: string;
  committedDate: string;
  history: { totalCount: number };
};
type Repo = {
  defaultBranchRef: { name: string; target: Commit } | null;
  [alias: string]: unknown;
};

/** The default branch, and each value's reading or what went wrong. */
export type GithubResult = {
  branch: string;
  readings: Map<string, Reading | Error>;
};

/** `docs/decisions/[0-9]*.md` → the directory and a pattern for names in it. Globs only in the last segment. */
function splitPath(path: string): { dir: string; name: RegExp } {
  const segments = path.replace(/^\/+|\/+$/g, "").split("/");
  const isGlob = (s: string) => /[*?[]/.test(s);
  if (segments.slice(0, -1).some(isGlob))
    throw new Error(`"${path}": a glob only works in the file name`);
  const last = segments.at(-1)!;
  if (!isGlob(last)) return { dir: segments.join("/"), name: /^/ };
  const re = last
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return { dir: segments.slice(0, -1).join("/"), name: new RegExp(`^${re}$`) };
}

/** A dependency's version from package.json or a pnpm catalog, range characters dropped, cut to `parts` numbers. */
export function versionIn(
  text: string,
  file: string,
  pkg: string,
  parts: number,
): string {
  let spec: unknown;
  if (file.endsWith(".json")) {
    const json = JSON.parse(text) as Record<
      string,
      Record<string, string> | undefined
    >;
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ])
      spec ??= json[field]?.[pkg];
  } else if (/(^|\/)pnpm-workspace\.ya?ml$/.test(file)) {
    const ws = parseYaml(text) as {
      catalog?: Record<string, string>;
      catalogs?: Record<string, Record<string, string>>;
    };
    spec =
      ws.catalog?.[pkg] ??
      Object.values(ws.catalogs ?? {}).find((c) => c[pkg])?.[pkg];
  } else
    throw new Error(
      `can't read versions from ${file}: use a package.json or pnpm-workspace.yaml`,
    );

  if (typeof spec !== "string") throw new Error(`${pkg} isn't in ${file}`);
  if (spec.startsWith("catalog:"))
    throw new Error(
      `${pkg} comes from the pnpm catalog: set \`file: pnpm-workspace.yaml\``,
    );
  const m = /\d+(?:\.\d+){0,2}/.exec(spec);
  if (!m) throw new Error(`no version in "${spec}" (${pkg}, ${file})`);
  const numbers = m[0].split(".");
  if (numbers.length < parts)
    throw new Error(
      `"${spec}" has fewer than ${parts} numbers (${pkg}, ${file})`,
    );
  return numbers.slice(0, parts).join(".");
}

export async function readGithub(
  repo: string,
  defs: [string, Def<"github">][],
): Promise<GithubResult> {
  const [owner, name] = repo.split("/");
  const files = new Map<string, string>(); // file → alias
  const dirs = new Map<string, string>();
  const vars: Record<string, string> = { owner, name };
  const fields: string[] = [];
  const declare: string[] = ["$owner: String!", "$name: String!"];

  const alias = (
    map: Map<string, string>,
    prefix: string,
    key: string,
    shape: string,
  ) => {
    let a = map.get(key);
    if (!a) {
      a = `${prefix}${map.size}`;
      map.set(key, a);
      vars[a] = `HEAD:${key}`;
      declare.push(`$${a}: String!`);
      fields.push(`${a}: object(expression: $${a}) { ${shape} }`);
    }
    return a;
  };

  const errors = new Map<string, Error>();
  for (const [valueName, def] of defs) {
    try {
      if (def.get === "version")
        alias(files, "f", def.file ?? "package.json", "... on Blob { text }");
      if (def.get === "fileCount")
        alias(
          dirs,
          "d",
          splitPath(def.path).dir,
          "... on Tree { entries { name type } }",
        );
    } catch (e) {
      errors.set(valueName, e as Error);
    }
  }

  const query = `query(${declare.join(", ")}) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name target { ... on Commit { oid committedDate history { totalCount } } } }
    ${fields.join("\n    ")}
  }
}`;
  const { repository } = await graphql<{ repository: Repo | null }>(
    query,
    vars,
  );
  if (!repository) throw new Error(`no repository ${repo}`);
  const head = repository.defaultBranchRef;
  if (!head) throw new Error(`${repo} has no default branch`);
  const branch = head.name;
  const web = `https://github.com/${repo}`;

  const readings = new Map<string, Reading | Error>(errors);
  for (const [valueName, def] of defs) {
    if (readings.has(valueName)) continue;
    try {
      readings.set(valueName, readOne(def));
    } catch (e) {
      readings.set(valueName, e as Error);
    }
  }
  return { branch, readings };

  function readOne(def: Def<"github">): Reading {
    switch (def.get) {
      case "commits":
        return {
          value: head!.target.history.totalCount,
          source: `${web}/commits/${branch}`,
        };
      case "lastCommit":
        return {
          value: head!.target.committedDate.slice(0, 10),
          source: `${web}/commit/${head!.target.oid}`,
        };
      case "version": {
        const file = def.file ?? "package.json";
        const blob = repository![files.get(file)!] as { text?: string } | null;
        if (!blob?.text) throw new Error(`no file ${file} in ${repo}`);
        return {
          value: versionIn(blob.text, file, def.package, def.parts),
          source: `${web}/blob/${branch}/${file}`,
        };
      }
      case "fileCount": {
        const { dir, name } = splitPath(def.path);
        const tree = repository![dirs.get(dir)!] as {
          entries?: { name: string; type: string }[];
        } | null;
        if (!tree?.entries) throw new Error(`no directory ${dir} in ${repo}`);
        const count = tree.entries.filter(
          (e) => e.type === "blob" && name.test(e.name),
        ).length;
        if (count === 0)
          throw new Error(`no files match ${def.path} in ${repo}`);
        return { value: count, source: `${web}/tree/${branch}/${dir}` };
      }
    }
  }
}
