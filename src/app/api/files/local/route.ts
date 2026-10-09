import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { LocalStorageAdapter, signLocalKey } from "@/lib/storage/local";

export const dynamic = "force-dynamic";

/**
 * Serves objects for the local-disk storage driver, standing in for the signed URLs
 * that S3 and Azure issue natively. Enabled by the driver rather than by the
 * environment, so it also serves a single-VM production deployment using local disk.
 *
 * The signature check is the whole point: without it this route would let anyone read
 * any participant's submission by guessing a key.
 */
export async function GET(request: NextRequest) {
  if (env.STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const key = params.get("key");
  const expires = Number(params.get("expires"));
  const signature = params.get("sig");

  if (!key || !signature || !Number.isFinite(expires)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (expires < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  if (!safeEqual(signature, signLocalKey(key, expires))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  try {
    const { body, contentType } = await new LocalStorageAdapter().get(key);
    const filename = params.get("filename") ?? "file";
    const disposition = params.get("inline") === "1" ? "inline" : "attachment";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    };

    /**
     * An uploaded web page, served from our own origin, is the one dangerous thing
     * this route can hand back.
     *
     * The session cookie is httpOnly and SameSite=strict, so a script in that page
     * cannot read it — but same-origin it would not need to. `fetch("/api/…")` from a
     * page on our own host carries the judge's session, and a super admin viewing it
     * would be lending their console to whatever wrote the file.
     *
     * `sandbox` puts the document in an opaque origin: its requests are no longer
     * same-site, so SameSite=strict withholds the cookie, and it cannot reach into
     * anything of ours. `allow-scripts` is granted because these reports routinely
     * draw their own charts, and a script confined to a null origin can only affect
     * what it already contains. It is deliberately not given `allow-same-origin`,
     * which together with `allow-scripts` would let it remove its own sandbox.
     *
     * Decided from the stored content type rather than a query parameter, so there is
     * no version of the URL that serves the same file unsandboxed.
     */
    headers["Content-Security-Policy"] = contentType.toLowerCase().startsWith("text/html")
      ? "sandbox allow-scripts allow-popups"
      : // Everything else here is a PDF or an image — not a document that can load
        // anything — but a policy is stated rather than omitted, because this route no
        // longer receives the site-wide one (see next.config.ts).
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

    return new NextResponse(new Uint8Array(body), { headers });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
