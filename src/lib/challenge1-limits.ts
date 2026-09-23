/**
 * Challenge 1's limits.
 *
 * Deliberately separate from src/lib/challenge1.ts, which touches the database. The
 * drawer components are client components and need these numbers; importing them from
 * a module that also imports Prisma drags the Postgres driver — and its `dns` and `fs`
 * requires — into the browser bundle, where the build fails.
 *
 * Nothing in this file may import anything server-only.
 */

/**
 * Caps, per decision D8.
 *
 * 1000 participants times unlimited free-text drawers is a real payload and abuse
 * surface, and an accidental paste of a 40MB log would otherwise be accepted. Generous
 * enough that nobody working in good faith will meet them.
 */
export const MAX_ENTRIES = 50;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
