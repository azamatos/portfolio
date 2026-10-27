// Uploads to Cloudflare R2 (bucket azamatos-media, served at media.azamatos.com) through its S3 API. Names carry a
// content hash, so a file that's already there is the same file and is skipped.

import { AwsClient } from "aws4fetch";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_DIR } from "./config.ts";
import type { OutFile } from "./shots/encode.ts";

const BUCKET = "azamatos-media";
export const MEDIA_URL = "https://media.azamatos.com";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const NEEDED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

/** The R2 variables that aren't set; empty when uploads can run. */
export const missingCredentials = () =>
  NEEDED.filter((name) => !process.env[name]?.trim());

let client: AwsClient | undefined;

function r2() {
  client ??= new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    service: "s3",
    region: "auto",
  });
  return client;
}

const endpoint = (key: string) =>
  `https://${process.env.R2_ACCOUNT_ID!.trim()}.r2.cloudflarestorage.com/${BUCKET}/${key}`;

async function withRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (attempt === 3)
        throw new Error(`${what}: ${(e as Error).message}`, { cause: e });
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Puts each file at `<prefix>/<name>` unless it's there already. Returns how many were sent. */
export async function upload(
  prefix: string,
  files: OutFile[],
): Promise<number> {
  let sent = 0;
  for (const file of files) {
    const key = `${prefix}/${file.name}`;
    const head = await withRetry(`HEAD ${key}`, () =>
      r2().fetch(endpoint(key), {
        method: "HEAD",
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (head.ok) continue;
    if (head.status !== 404)
      throw new Error(`R2 answered ${head.status} to HEAD ${key}`);
    await withRetry(`PUT ${key}`, async () => {
      const res = await r2().fetch(endpoint(key), {
        method: "PUT",
        body: new Uint8Array(file.body),
        headers: { "content-type": file.type, "cache-control": CACHE_CONTROL },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok)
        throw new Error(
          `R2 answered ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
    });
    sent++;
  }
  return sent;
}

/** Without credentials (or with --dry-run): the files go to .cache/refresh/<prefix>/ instead. */
export async function saveLocally(
  prefix: string,
  files: OutFile[],
): Promise<string> {
  const dir = new URL(`${prefix}/`, CACHE_DIR);
  for (const file of files) {
    const path = fileURLToPath(new URL(file.name, dir));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.body);
  }
  return fileURLToPath(dir);
}
