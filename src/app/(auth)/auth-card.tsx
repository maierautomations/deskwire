import { cn } from "@/lib/utils";

// The proof sheet: auth card framed by four trim marks (brand book 5.4/5.5,
// motif family 3). Marks sit just outside the sheet in --line, one level of
// punctuation, never a wallpaper.
const TRIM_MARK = "pointer-events-none absolute h-3 w-3 border-line";

export function AuthCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span aria-hidden className={cn(TRIM_MARK, "-top-2 -left-2 border-t border-l")} />
      <span aria-hidden className={cn(TRIM_MARK, "-top-2 -right-2 border-t border-r")} />
      <span aria-hidden className={cn(TRIM_MARK, "-bottom-2 -left-2 border-b border-l")} />
      <span aria-hidden className={cn(TRIM_MARK, "-bottom-2 -right-2 border-b border-r")} />
      {/* Deliberately flat (Chanel rule, task 8): a proof sheet lies on the
          paper, so the border and trim marks carry the card, no shadow. */}
      <div
        className={cn(
          "rounded-md border border-line bg-paper-raised p-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
