import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The two marks.
 *
 * Both are sized by **height**, because that is what makes two logos of different
 * proportions sit level with each other. Sizing by width would leave the squarish WTQ
 * lockup towering over the wide 10Pearls wordmark — which is exactly what happened
 * when the width and height attributes were being overridden by `w-auto h-auto`.
 */

/** The cropped viewBox in public/wtq-logo.svg: 203 × 125, artwork only. */
const WTQ_ASPECT = 203 / 125;

export function WtqLogo({ height = 34, className }: { height?: number; className?: string }) {
  return (
    <Image
      src="/wtq-logo.svg"
      alt="Women Tech Quest"
      width={Math.round(height * WTQ_ASPECT)}
      height={height}
      // Height is the constraint; width follows from the aspect ratio. Set in style
      // rather than as classes so nothing passed in can quietly override the size.
      style={{ height, width: "auto" }}
      className={className}
      priority
    />
  );
}

/**
 * The 10Pearls wordmark.
 *
 * Drawn as type until the real asset arrives — dropping it in at
 * public/10pearls-logo.svg is a one-line change here. Hand-drawing someone else's logo
 * from a screenshot would produce something subtly wrong, which is worse than an honest
 * wordmark. See P8 in docs/PENDING.md.
 *
 * `fontSize` is roughly the cap height to match against, so a caller sizing the pair
 * together has one number for each.
 */
export function TenPearlsLogo({
  fontSize = 16,
  className,
}: {
  fontSize?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("font-display leading-none font-bold tracking-tight whitespace-nowrap", className)}
      style={{ fontSize }}
      aria-label="10Pearls"
    >
      10<span className="font-semibold">Pearls</span>
    </span>
  );
}

/**
 * Both marks together, divided by a hairline.
 *
 * 10Pearls first and the event mark second: the company runs the event, and the order
 * says so without either competing. The wordmark is set at roughly half the lockup's
 * height, which is what makes them read as equals rather than one shouting.
 */
export function BrandLockup({
  height = 34,
  className,
}: {
  height?: number;
  className?: string;
}) {
  // The lockup stacks three lines of type, so it carries far more visual weight than
  // a single wordmark of the same height. A third of its height is what makes the two
  // read as equals; the floor keeps the wordmark legible in a header, where a strict
  // ratio would shrink it to nothing.
  const wordmark = Math.max(14, Math.round(height * 0.33));

  return (
    <span className={cn("flex items-center", className)} style={{ gap: height * 0.38 }}>
      <TenPearlsLogo fontSize={wordmark} />
      <span
        aria-hidden="true"
        className="bg-border w-px shrink-0"
        style={{ height: height * 0.66 }}
      />
      <WtqLogo height={height} />
    </span>
  );
}
