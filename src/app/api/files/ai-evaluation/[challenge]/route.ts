import { NextResponse } from "next/server";
import {
  canReadAiEvaluation,
  getAiEvaluationReport,
  isAiEvaluationChallenge,
} from "@/lib/event-config";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The automated assessment of one challenge's reports.
 *
 * One file per challenge rather than one for both, because the assessment is run per
 * challenge and a judge marking Challenge 2 should not be handed Challenge 3's
 * results to read around.
 *
 * Judges and super admins only, checked here rather than left to which pages happen to
 * link to it. It says how submissions scored, which is not a participant's to read —
 * and a participant who guesses this URL gets the same 404 as somebody not signed in.
 *
 * When the file is a web page it is served sandboxed. That is handled where the bytes
 * go out rather than here, because this route only issues a redirect to a signed URL —
 * see the Content-Security-Policy in src/app/api/files/local/route.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challenge: string }> },
) {
  const user = await getSessionUser();

  if (!canReadAiEvaluation(user?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { challenge } = await params;
  const key = challenge.toUpperCase();

  if (!isAiEvaluationChallenge(key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await getAiEvaluationReport(key);
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
    console.error("[ai-evaluation]", key, error);
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }
}
