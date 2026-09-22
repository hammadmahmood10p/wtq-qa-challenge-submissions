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
