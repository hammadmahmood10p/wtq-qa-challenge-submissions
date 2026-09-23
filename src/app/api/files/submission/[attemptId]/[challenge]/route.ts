import { NextResponse } from "next/server";
import type { ChallengeKey } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const UPLOADABLE: ChallengeKey[] = ["C2", "C3"];

/**
 * Serves a participant's uploaded report.
 *
 * This is what the judge's "View File" button opens, and the requirement is specific:
 * the PDF must render in the browser, not download. That is the `inline: true` below.
 *
 * Authorisation is decided here rather than by possession of a link. The stored object
 * key is an unguessable UUID, but unguessable is not access control — a judge who has
 * seen one participant's URL must not reach another's by editing it, and a participant
 * must never reach anyone's but their own. The signed URL is issued per request and
 * expires in minutes, so one copied out of the address bar stops working.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string; challenge: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const { attemptId, challenge } = await params;
  const key = challenge.toUpperCase() as ChallengeKey;

  if (!UPLOADABLE.includes(key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const submission = await db.challengeSubmission.findUnique({
    where: { attemptId_challenge: { attemptId, challenge: key } },
    select: {
      fileKey: true,
      originalFilename: true,
      attempt: { select: { participantId: true } },
    },
  });

  if (!submission?.fileKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = user.role === "PARTICIPANT" && user.id === submission.attempt.participantId;
  const isReviewer = user.role === "JUDGE" || user.role === "SUPER_ADMIN";

  // 404 rather than 403: that a file exists is not information an outsider needs.
  if (!isOwner && !isReviewer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = await storage().getSignedUrl(submission.fileKey, {
      expiresInSeconds: 300,
      inline: true,
      filename: submission.originalFilename ?? "submission.pdf",
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[submission:view]", error);
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }
}
