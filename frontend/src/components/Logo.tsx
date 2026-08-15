import Image from "next/image";

import { cx } from "@/lib/utils";

/**
 * The supplied artwork, used as-is.
 *
 * Deliberately not redrawn or cropped to a single letter: at small sizes the
 * whole lockup still reads as the brand, and using the real file means the mark
 * can never drift from what the studio actually uses. `object-contain` keeps
 * every edge of the artwork visible however the tile is sized.
 */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx("block shrink-0 overflow-hidden rounded-xl", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="Twelve East"
        width={size * 3}
        height={size * 3}
        priority
        className="h-full w-full object-contain"
      />
    </span>
  );
}

/** The wide lockup, for screens with room - sign-in and the 404 page. */
export function LogoWordmark({
  height = 56,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={cx("block overflow-hidden rounded-xl", className)}
      style={{ height }}
    >
      <Image
        src="/logo-wordmark.png"
        alt="Twelve East"
        width={height * 6}
        height={height}
        priority
        className="h-full w-auto object-contain"
      />
    </span>
  );
}
