"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** The pickup code, large and easy to copy. */
export function PickupCode({ code, size = "lg" }: { code: string; size?: "lg" | "sm" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the code is still on screen to read out.
    }
  }
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          size === "lg"
            ? "rounded-md bg-lemon px-4 py-2 font-heading text-4xl font-extrabold tracking-widest text-cola sm:text-5xl"
            : "rounded-md bg-lemon px-3 py-1 font-heading text-xl font-extrabold tracking-wider text-cola"
        }
      >
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-bold text-cola hover:bg-accent"
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {copied ? "Copied" : "Copy code"}
      </button>
    </div>
  );
}
