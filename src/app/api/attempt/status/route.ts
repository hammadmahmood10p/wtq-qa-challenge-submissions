import { NextResponse } from "next/server";
import { getAttempt } from "@/lib/attempt";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The clock's source of truth for the browser.
 *
 * Used for two things: correcting the client's offset so a wrong laptop clock cannot
 * change what a participant sees, and noticing that the attempt has ended — whether
 * the time ran out or another tab submitted.
 */
export async function GET() {
  const user = await getSessionUser();

  if (!user || user.role !== "PARTICIPANT") {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const attempt = await getAttempt(user.id);

  return NextResponse.json(
    {
      state: attempt.state,
      serverNow: attempt.serverNow.toISOString(),
      endsAt: attempt.endsAt?.toISOString() ?? null,
      remainingMs: attempt.remainingMs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
