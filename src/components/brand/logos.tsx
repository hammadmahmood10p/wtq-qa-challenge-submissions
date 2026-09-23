import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Women Tech Quest mark.
 *
 * Served as a static SVG rather than inlined: it appears on nearly every screen, so
 * the browser should cache it once instead of re-parsing it in every payload.
 */
export function WtqLogo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/wtq-logo.svg"
      alt="Women Tech Quest"
      width={size}
      height={Math.round(size * (195.124 / 219.101))}
      className={cn("h-auto w-auto", className)}
      priority
    />
  );
}

/**
 * The 10Pearls wordmark.
 *
 * Drawn as type until the real asset arrives — the organisers have it as an SVG, and
 * dropping it in at public/10pearls-logo.svg is a one-line change here. Hand-drawing
 * someone else's logo from a screenshot would produce something subtly wrong, which is
 * worse than an honest wordmark. See P8 in docs/PENDING.md.
 */
export function TenPearlsLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-display text-[17px] leading-none font-bold tracking-tight", className)}
      aria-label="10Pearls"
    >
      10
      <span className="font-semibold">Pearls</span>
    </span>
  );
}

/**
 * Both marks together, as they appear in the product header.
 *
 * 10Pearls first and the event mark second, with a hairline between — the company runs
 * the event, and the order says so without either competing.
 */
export function BrandLockup({
  className,
  wtqSize = 40,
}: {
  className?: string;
  wtqSize?: number;
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <TenPearlsLogo />
      <span aria-hidden="true" className="bg-border h-6 w-px" />
      <WtqLogo size={wtqSize} />
    </span>
  );
}
