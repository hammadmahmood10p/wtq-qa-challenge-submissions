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

/**
 * The assets' own dimensions — the cropped viewBox in public/wtq-logo.svg, and the
 * supplied 10Pearls file.
 *
 * These are passed to next/image as-is rather than scaled to the display size. The
 * component compares the rendered box against these numbers to decide whether the
 * aspect ratio has been broken, and a rounded display width fails that check by a
 * fraction of a pixel. Giving it the true intrinsic size and sizing in CSS is the
 * combination it is actually expecting.
 */
const WTQ_INTRINSIC = { width: 203, height: 125 };
const TENPEARLS_INTRINSIC = { width: 652, height: 200 };

export function WtqLogo({ height = 34, className }: { height?: number; className?: string }) {
  return (
    <Image
      src="/wtq-logo.svg"
      alt="Women Tech Quest"
      width={WTQ_INTRINSIC.width}
      height={WTQ_INTRINSIC.height}
      // Height is the constraint; width follows from the aspect ratio. Set in style
      // rather than as classes so nothing passed in can quietly override the size.
      style={{ height, width: "auto" }}
      className={className}
      priority
    />
  );
}

/**
 * The official 10Pearls wordmark.
 *
 * The asset is a single colour on transparency, so dark mode is a straight inversion
 * of it — black artwork becomes white and the transparency is untouched. That is
 * `.logo-invert-on-dark` in globals.css, which knows about the manual theme override
 * as well as the system preference.
 *
 * Sized by height to match WtqLogo, so a caller placing the pair has one number.
 */
export function TenPearlsLogo({
  height = 16,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <Image
      src="/10pearls-logo.webp"
      alt="10Pearls"
      width={TENPEARLS_INTRINSIC.width}
      height={TENPEARLS_INTRINSIC.height}
      style={{ height, width: "auto" }}
      className={cn("logo-invert-on-dark", className)}
      priority
    />
  );
}

/**
 * Both marks together, divided by a hairline.
 *
 * 10Pearls first and the event mark second: the company runs the event, and the order
 * says so without either competing.
 */
export function BrandLockup({
  height = 34,
  className,
}: {
  height?: number;
  className?: string;
}) {
  // The WTQ lockup stacks three lines of type, so it carries far more visual weight
  // than a single-line wordmark of the same height. Roughly half is what makes the two
  // read as equals. The floor matters more than the ratio at header sizes: below about
  // 18px the counter inside the "0" closes up and the mark reads as a blob.
  const wordmark = Math.max(18, Math.round(height * 0.46));

  return (
    <span className={cn("flex items-center", className)} style={{ gap: height * 0.38 }}>
      <TenPearlsLogo height={wordmark} />
      <span
        aria-hidden="true"
        className="bg-border w-px shrink-0"
        style={{ height: height * 0.66 }}
      />
      <WtqLogo height={height} />
    </span>
  );
}
