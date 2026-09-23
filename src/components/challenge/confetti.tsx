/**
 * Signature moment 5: the end of three hours.
 *
 * Aurora-coloured, about a second and a half, once. This is the last thing a
 * participant sees after a long morning, and it should read as an achievement rather
 * than a receipt.
 *
 * Deliberately plain: forty spans driven by one CSS keyframe — no canvas, no library,
 * no client component. It runs once on a page that does nothing else, and the cheapest
 * thing that looks right is the right thing.
 *
 * The scatter is computed from the index rather than from Math.random. Nobody sees
 * this twice, so actual randomness buys nothing, and a deterministic layout renders
 * identically on the server and in the browser — no hydration mismatch, and no need
 * for an effect to defer it past mount. Reduced motion is handled in globals.css,
 * where the pieces are given a 0.01ms animation and are gone before they are seen.
 */

const COLOURS = [
  "var(--brand-indigo)",
  "var(--brand-periwinkle)",
  "var(--brand-gold)",
  "var(--brand-green)",
];

const PIECES = 40;

/** Irrational multipliers, so the values spread rather than landing in bands. */
const spread = (i: number, factor: number) => (i * factor) % 1;

export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: PIECES }, (_, i) => {
        const round = i % 3 === 0;
        const size = 6 + spread(i, 0.6180339887) * 7;

        return (
          <span
            key={i}
            className="confetti-piece absolute top-0 block"
            style={
              {
                left: `${spread(i, 0.7548776662) * 100}%`,
                width: size,
                height: size * (round ? 1 : 1.6),
                background: COLOURS[i % COLOURS.length],
                borderRadius: round ? "50%" : 2,
                "--drift": `${(spread(i, 0.4142135623) - 0.5) * 240}px`,
                "--spin": `${360 + spread(i, 0.3027756377) * 540}deg`,
                "--fall": `${1100 + spread(i, 0.2360679774) * 700}ms`,
                "--delay": `${spread(i, 0.5698402909) * 350}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
