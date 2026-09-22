import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

/**
 * A cheap first gate, not the authorisation check.
 *
 * Middleware runs on the edge runtime, which cannot reach the database — so it can
 * confirm a token is validly signed and unexpired, but not that the session is still
 * live or the account still active. A blocked participant's token stays
 * cryptographically valid until it expires.
 *
 * The real checks are requireUser / requireRole in src/lib/auth.ts, which every
 * protected layout calls. This only exists to bounce obviously-unauthenticated
 * requests without paying for a render.
 *
 * It reads SESSION_SECRET straight from process.env rather than importing
 * src/lib/env.ts, whose validation uses Buffer and would not run on the edge.
 *
 * Known tech debt: Next 16 deprecates the `middleware` file convention in favour of
 * `proxy` and prints a warning on every dev start. Deliberately not migrated before
 * the event — it still works, and a framework convention change is not worth the risk
 * this close to 10 October. Revisit after.
 */

const SESSION_COOKIE = "wtq_session";
const PROTECTED_PREFIXES = ["/admin", "/judge", "/challenge", "/change-password"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      return NextResponse.next();
    } catch {
      // fall through to the redirect
    }
  }

  const loginUrl = new URL("/login", request.url);
  // Preserve where they were going, so a session that expired mid-task returns them
  // to the same place rather than dumping them on a dashboard.
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);

  const response = NextResponse.redirect(loginUrl);
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/judge/:path*", "/challenge/:path*", "/change-password/:path*"],
};
