import { NextResponse } from "next/server";
import { canReadKnownBugs, getKnownBugsPdf } from "@/lib/event-config";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The organisers' list of defects seeded into the application under test.
 *
 * **Judges and super admins only, and this is the line that enforces it.** This
 * document is the answer key — it says what was broken on purpose. A participant who
 * read it would have nothing left to find, and the whole of Challenge 1 would be a
 * transcription exercise.
 *
 * Note the role check rather than merely a session check, which is what the Challenge 4
 * CSV does. That file is meant for participants; this one is the opposite, and the
 * difference has to live here rather than in which pages happen to link to it. A
 * participant who guesses this URL gets the same answer as one who is not signed in at
 * all.
 */
export async function GET() {
  const user = await getSessionUser();

  if (!canReadKnownBugs(user?.role)) {
    // 404 rather than 403: that this document exists is not something a participant
    // needs confirmed.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdf = await getKnownBugsPdf();
  if (!pdf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const url = await storage().getSignedUrl(pdf.key, {
      expiresInSeconds: 300,
      // Opens in the browser rather than landing in Downloads: a judge checking a
      // finding against the list wants it on screen beside the submission.
      inline: true,
      filename: pdf.filename,
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[known-bugs]", error);
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }
}
