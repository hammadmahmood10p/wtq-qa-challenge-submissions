import { NextResponse } from "next/server";
import { canReadAiEvaluation, getAiEvaluationReport } from "@/lib/event-config";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The automated assessment of the Challenge 2 and 3 reports.
 *
 * Judges and super admins only, checked here rather than left to which pages happen to
 * link to it. It says how submissions scored, which is not a participant's to read —
 * and a participant who guesses this URL gets the same 404 as somebody not signed in.
 *
 * When the file is a web page it is served sandboxed. That is handled where the bytes
 * go out rather than here, because this route only issues a redirect to a signed URL —
 * see the Content-Security-Policy in src/app/api/files/local/route.ts.
 */
export async function GET() {
  const user = await getSessionUser();

  if (!canReadAiEvaluation(user?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await getAiEvaluationReport();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const url = await storage().getSignedUrl(report.key, {
      expiresInSeconds: 300,
      // Read on screen beside the submission, not downloaded and opened later.
      inline: true,
      filename: report.filename,
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[ai-evaluation]", error);
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }
}
