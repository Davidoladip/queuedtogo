"use client";

import { useState } from "react";

export function CopyField({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  return (
    <div className="linkbox">
      <code>{value}</code>
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied("done");
          } catch {
            setCopied("failed");
          }
        }}
      >
        {copied === "done" ? "Copied" : copied === "failed" ? "Select and copy" : label}
      </button>
    </div>
  );
}
