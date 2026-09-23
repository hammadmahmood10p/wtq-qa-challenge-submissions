import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves a screenshot attached to a Challenge 1 entry.
 *
 * Authorisation is decided here, not by possession of the link. The stored key is an
 * unguessable UUID, but unguessable is not access control: a participant must reach
 * only their own evidence, and a judge who has seen one submission must not reach
 * another by editing a URL.
 *
 * Served inline so it renders in the page. The signed URL is issued per request and
 * expires in minutes, so one copied out of the address bar stops working.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const { attachmentId } = await params;

  const attachment = await db.challenge1Attachment.findUnique({
    where: { id: attachmentId },
    select: {
      fileKey: true,
      originalFilename: true,
      entry: { select: { attempt: { select: { participantId: true } } } },
    },
  });

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner =
    user.role === "PARTICIPANT" && user.id === attachment.entry.attempt.participantId;
  const isReviewer = user.role === "JUDGE" || user.role === "SUPER_ADMIN";

  // 404 rather than 403: that a file exists is not information an outsider needs.
  if (!isOwner && !isReviewer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = await storage().getSignedUrl(attachment.fileKey, {
      expiresInSeconds: 300,
      inline: true,
      filename: attachment.originalFilename,
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[evidence:view]", error);
    return NextResponse.json({ error: "Could not open that image" }, { status: 500 });
  }
}
