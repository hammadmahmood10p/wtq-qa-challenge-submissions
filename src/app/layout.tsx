import type { Metadata } from "next";
import "./globals.css";

/**
 * Fonts are vendored into public/fonts and declared in globals.css, not fetched
 * through next/font/google.
 *
 * The intent has not changed — the running app never calls Google, which matters on a
 * deployment with restricted egress. What changed is that `next/font/google` fetches
 * at *build* time, and the container build cannot reach fonts.googleapis.com through
 * the corporate proxy. A build that needs the internet for fonts is a build that fails
 * on the machine it matters on.
 *
 * Preloaded here rather than left to discovery: these two carry the headings and body
 * text of every page, and without the hint the browser only learns it needs them after
 * parsing the stylesheet.
 */

export const metadata: Metadata = {
  title: "Women Tech Quest 2026 — QA Challenge Portal",
  description: "Submission and evaluation portal for the Women Tech Quest 2026 QA challenges.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/sora-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
