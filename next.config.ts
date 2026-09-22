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

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
