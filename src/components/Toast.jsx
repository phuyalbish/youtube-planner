"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const Ctx = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((msg, opts = {}) => {
    const tone = opts.tone ?? "neutral";
    setToast({ msg, tone });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div
          className={[
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-full text-sm shadow-lg",
            "transition-all duration-150 pointer-events-none",
            toast.tone === "success"
              ? "bg-emerald-600 text-white"
              : toast.tone === "error"
                ? "bg-red-600 text-white"
                : "bg-zinc-900 text-white",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
