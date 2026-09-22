import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves a participant's Challenge 2 PDF.
 *
 * This is what the judge's "View File" button opens, and the requirement is specific:
 * the PDF must render in the browser, not download. That is the `inline: true` below,
 * which sets Content-Disposition on the signed URL.
 *
 * Authorisation is decided here rather than by possession of a link. The stored object
 * key is an unguessable UUID, but "unguessable" is not an access control — a judge who
 * has seen one participant's URL must not be able to reach another's by editing it,
 * and a participant must never reach anyone's but their own.
 *
 * The signed URL is short-lived and issued per request, so a URL copied out of the
 * address bar stops working within minutes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const { attemptId } = await params;

  const submission = await db.challenge2Submission.findUnique({
    where: { attemptId },
    select: {
      fileKey: true,
      originalFilename: true,
      attempt: { select: { participantId: true } },
    },
  });

  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = user.role === "PARTICIPANT" && user.id === submission.attempt.participantId;
  const isReviewer = user.role === "JUDGE" || user.role === "SUPER_ADMIN";

  // Deliberately 404 rather than 403: telling someone a file exists but is not theirs
  // is information they have no use for.
  if (!isOwner && !isReviewer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = await storage().getSignedUrl(submission.fileKey, {
      expiresInSeconds: 300,
      inline: true,
      filename: submission.originalFilename,
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[challenge2:view]", error);
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }
}
