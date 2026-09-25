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

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
