import * as React from "react"

import { cn } from "@/lib/utils"

// A NATIVE select in the installed preset's idiom (same token classes as Input
// and Textarea, focus ring --ring which globals.css maps to --ink). Deliberately
// not shadcn's Select: that one is a Radix component and would be a new
// dependency plus client JavaScript for a control the platform already has.
// The disclosure arrow is browser chrome, not our iconography (brand book 5.7).
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
