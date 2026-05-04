"use client";

import { useEffect } from "react";

export function Modal({ open, onClose, title, wide = false, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-hidden flex flex-col`}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center">
          <h3 className="text-[15px] font-semibold m-0">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-2 py-1 rounded-md text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2 bg-zinc-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
