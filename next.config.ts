import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained Node server in .next/standalone.
  //
  // This is what keeps R0 survivable: the 10Pearls IT team has not yet told us where
  // this deploys, and standalone output runs unchanged on Vercel, Azure App Service,
  // AWS, or a VM behind nginx. Nothing here may depend on a specific platform.
  output: "standalone",

  // Server-only packages that must not be traced into the client bundle.
  serverExternalPackages: ["@node-rs/argon2"],

  experimental: {
    // Server Actions accept 1MB by default, which silently rejects every Challenge 2
    // report. MAX_UPLOAD_MB is 20; the extra allows for multipart overhead.
    //
    // A raised limit is a denial-of-service surface, so the real cap stays on the
    // server (validatePdf) and the concurrency behaviour of large uploads is a Day 12
    // load-test question — see T2 in docs/PENDING.md.
    serverActions: { bodySizeLimit: "25mb" },
  },

  // The dark circle in the bottom-left corner is **Next.js's** dev-tools indicator,
  // not a database badge — it is the framework's own "N", and it has never appeared
  // in a production build. Hidden because it was being mistaken for one, and because
  // it sits on top of the interface during the dress rehearsal.
  //
  // Compile and runtime errors are still surfaced; this only removes the badge.
  // Set it back to `{ position: "bottom-right" }` to get it back while debugging.
  devIndicators: false,

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Nothing here needs a camera, a microphone or a location, so nothing here
          // may ask. Cheap, and it closes the question before anyone raises it.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
      {
        /**
         * The Content-Security-Policy, everywhere except the file-serving route.
         *
         * That route hands back uploaded files, one kind of which is a web page — the
         * AI evaluation report. Such a page has to be served sandboxed, in an opaque
         * origin, or a script inside it would run on our own host with a judge's
         * session behind it. The route sets that policy per response, because only it
         * knows what kind of file is going out.
         *
         * A header set here would silently replace the one the route sets, which is
         * exactly what happened the first time: the sandbox never reached the browser
         * and the response carried the ordinary site policy, which permits inline
         * script. So the policy is withheld from that one path and supplied there
         * instead. Every other header above still applies to it.
         */
        source: "/((?!api/files/local).*)",
        headers: [{ key: "Content-Security-Policy", value: CSP }],
      },
    ];
  },
};

/**
 * Content-Security-Policy, added after the assessment of 1 Oct 2026.
 *
 * `'unsafe-inline'` on script-src is a real concession and is called out rather than
 * buried. Next.js serves its hydration payload as inline <script> tags, and removing
 * the concession means nonces threaded through a middleware on every response — a
 * change that fails in ways only some pages show, which is not a change to make nine
 * days before a one-shot event.
 *
 * What remains is still worth having, because the attacks it closes are the ones this
 * application is actually shaped for: no script may be *loaded* from another origin,
 * nothing can be framed, no plugin content can run, and — the one that matters most
 * here — `form-action 'self'` means a stolen page cannot post a participant's
 * credentials anywhere but back to us.
 *
 * `style-src` needs 'unsafe-inline' too: the countdown ring and the timer colours are
 * set as inline style attributes, computed per render from the time remaining.
 *
 * Revisit after the event, when nonces can be introduced and tested properly.
 */
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' is **development only**. React's development build uses eval() to
  // rebuild call stacks for its error overlay, so without it every page dies on an
  // "eval() is not supported in this environment" console error and nothing can be
  // tested locally. It is never emitted by `next build`, which is the policy IT
  // scanned — if you are reading this because a scanner flagged 'unsafe-eval', check
  // which build produced the header before changing anything.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // data: for the inlined SVG icons, blob: for client-side image previews of evidence
  // before it is uploaded.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Turbopack pushes hot reloads down a websocket in development; production talks to
  // nothing but its own origin.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Would rewrite http://localhost to https:// and break every local request, so it is
  // left off in development. Production is behind TLS and keeps it.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

export default nextConfig;
