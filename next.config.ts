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
          { key: "Content-Security-Policy", value: CSP },
          // Nothing here needs a camera, a microphone or a location, so nothing here
          // may ask. Cheap, and it closes the question before anyone raises it.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
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
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // data: for the inlined SVG icons, blob: for client-side image previews of evidence
  // before it is uploaded.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export default nextConfig;
