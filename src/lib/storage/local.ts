import { createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { StorageAdapter } from "./types";

/**
 * Local-disk driver.
 *
 * The default in development, and permitted in production only where every instance
 * mounts the same directory — see src/lib/storage/policy.ts, which is where that rule
 * lives. On a single VM with a bind mount that is the simplest correct answer and has
 * no extra moving parts; across separate machines it loses uploads silently.
 *
 * STORAGE_LOCAL_DIR may be relative (resolved against the working directory) or
 * absolute, which is what a container bind mount will usually be.
 *
 * "Signed URLs" here are HMACs over the key and expiry, served back by
 * /api/files/local, mirroring what S3 and Azure issue natively.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private pathFor(key: string) {
    // Reject traversal outright rather than sanitising it.
    if (key.includes("..")) throw new Error("Invalid storage key");

    // turbopackIgnore stops the bundler tracing the whole project into the server
    // output because of this dynamic path. It affects what is bundled, not what runs,
    // so it stays correct now that this driver may also run in production.
    const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_LOCAL_DIR);
    return path.join(root, key);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.pathFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta`, JSON.stringify({ contentType }), "utf8");
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const file = this.pathFor(key);
    const body = await readFile(file);
    let contentType = "application/octet-stream";
    try {
      contentType = JSON.parse(await readFile(`${file}.meta`, "utf8")).contentType;
    } catch {
      // metadata sidecar missing — fall back to the generic type
    }
    return { body, contentType };
  }

  async getSignedUrl(
    key: string,
    opts: { expiresInSeconds?: number; inline?: boolean; filename?: string } = {},
  ): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 300);
    const signature = signLocalKey(key, expires);
    const params = new URLSearchParams({ key, expires: String(expires), sig: signature });
    if (opts.inline) params.set("inline", "1");
    if (opts.filename) params.set("filename", opts.filename);
    return `${env.APP_URL}/api/files/local?${params.toString()}`;
  }

  async delete(key: string): Promise<void> {
    const file = this.pathFor(key);
    await unlink(file).catch(() => {});
    await unlink(`${file}.meta`).catch(() => {});
  }
}

export function signLocalKey(key: string, expires: number): string {
  return createHmac("sha256", env.SESSION_SECRET).update(`${key}:${expires}`).digest("base64url");
}
