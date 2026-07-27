"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// "Link kopieren" via the async clipboard API. The confirmation is a machine
// statement, so it renders in mono (brand book 5.3); no animation, the text
// simply appears and leaves (motion budget untouched). Failure stays visible
// with a manual fallback instead of failing silently.
export function CopyLinkButton({ url }: { url: string }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (feedback !== "copied") {
      return;
    }
    const timer = setTimeout(() => setFeedback("idle"), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" size="sm" onClick={copy} className="w-fit">
        Link kopieren
      </Button>
      <span aria-live="polite" className="font-mono text-xs text-ink-soft">
        {feedback === "copied" ? "Kopiert." : null}
        {feedback === "failed"
          ? "Kopieren fehlgeschlagen. Markiere den Link von Hand."
          : null}
      </span>
    </div>
  );
}
