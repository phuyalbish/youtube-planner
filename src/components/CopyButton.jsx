"use client";

import { useState } from "react";
import { useToast } from "./Toast";

export function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text || "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          toast("Copy failed", { tone: "error" });
        }
      }}
      className={[
        "ml-auto text-[11px] px-2 py-0.5 rounded transition-colors",
        copied ? "text-emerald-600" : "text-zinc-500 hover:text-zinc-900 hover:bg-white",
      ].join(" ")}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}
