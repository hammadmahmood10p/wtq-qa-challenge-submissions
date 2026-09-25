import { NextResponse } from "next/server";
import { getChallenge4Csv } from "@/lib/event-config";
import { getSessionUser } from "@/lib/session";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves the Challenge 4 starting CSV.
 *
 * Behind authentication rather than at a public URL. The object key is an unguessable
 * UUID, but the file is the same for everyone, so one participant posting the link
 * would hand it to anyone — including before the event starts. Requiring a session
 * costs nothing and keeps it inside the event.
 *
 * Any signed-in role may fetch it: participants need it to do the challenge, and
 * judges reviewing a Challenge 4 submission need to see what it was worked from.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const csv = await getChallenge4Csv();
  if (!csv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const url = await storage().getSignedUrl(csv.key, {
      expiresInSeconds: 300,
      // A download, not a preview: this is a file to open in a spreadsheet or feed to
      // a test framework, and rendering it as text in a browser tab helps nobody.
      inline: false,
      filename: csv.filename,
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[challenge4-csv]", error);
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }
}
