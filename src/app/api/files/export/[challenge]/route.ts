import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  exportArchiveName,
  isExportableChallenge,
  planSubmissionExport,
} from "@/lib/submission-export";
import { zipResponseStream } from "@/lib/zip";

// Node, not edge: this reads from the storage adapter and streams a zip built with
// Buffers, neither of which exists on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A thousand reports fetched one at a time will outlast the default. The work is all
// I/O, so the time is spent waiting on storage rather than burning CPU.
export const maxDuration = 300;

/**
 * Every uploaded report for one challenge, as a single archive.
 *
 * Super admin only. A judge can already open any individual submission, but handing
 * somebody the complete set of five hundred reports in one request is a different
 * thing from reading the one in front of them, and it belongs with the person
 * accountable for the event.
 *
 * The response streams. Nothing is assembled on disk first, and no more than one
 * report is in memory at a time, so the memory cost is flat whether the archive holds
 * five files or five hundred.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challenge: string }> },
) {
  await requireRole("SUPER_ADMIN");

  const { challenge } = await params;
  const key = challenge.toUpperCase();

  if (!isExportableChallenge(key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const plan = await planSubmissionExport(key);
    const filename = exportArchiveName(key);

    return new NextResponse(zipResponseStream(plan.entries), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        // How many reports are inside, for anyone checking the export was complete.
        "X-Submission-Count": String(plan.count),
        // nginx buffers a proxied response to disk by default, which for a multi-
        // gigabyte archive means the browser sits on an empty progress bar while the
        // VM fills its disk. This hands the bytes straight through.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[submission-export]", key, error);
    return NextResponse.json({ error: "Could not build that export" }, { status: 500 });
  }
}
