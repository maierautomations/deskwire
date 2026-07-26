import { BRAND_WORDMARK } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Brand wordmark (brand book 5.1): the lowercase word in the display face
// plus the approval check as one drawn SVG curve in rubric red. The slight
// imperfection is part of the mark and lives in the geometry, never in a
// filter. This file is the only place the check exists (brand-marks set).
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display font-semibold text-ink",
        className,
      )}
    >
      {BRAND_WORDMARK}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="mt-[0.1em] h-[0.8em] w-[0.8em] shrink-0 text-rubric"
      >
        <path d="M3.2 13.8C5.4 14.9 7.6 17.2 9 19.6C11.4 13.4 15.6 6.8 21.2 3.4" />
      </svg>
    </span>
  );
}
