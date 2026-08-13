import { cx } from "@/lib/utils";

/**
 * Twelve East monogram. A drawn mark rather than an icon font so it stays
 * crisp at any size and does not depend on an icon library.
 */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-xl bg-ink-900 text-canvas",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        width={size * 0.62}
        height={size * 0.62}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 9.5h4.2V24"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.4 11.2c1-1.4 2.6-2.2 4.3-2.2 2.6 0 4.3 1.7 4.3 4 0 1.9-1.1 3.3-3.4 5L15.4 24h9.2"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
