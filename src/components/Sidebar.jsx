"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

export function Sidebar({ channels, activeId, onSelect, onAdd }) {
  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[var(--border)] flex flex-col h-screen">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="w-8 h-8 shrink-0" />
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight m-0">Upload Planner</h1>
          <p className="text-xs text-zinc-500 m-0 mt-0.5">YouTube content scheduler</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {channels.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center px-4 py-6">No channels yet.</div>
        ) : (
          channels.map((c) => {
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={[
                  "w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "hover:bg-zinc-100 text-zinc-800",
                ].join(" ")}
              >
                <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                <span
                  className={[
                    "text-[11px] px-2 py-0.5 rounded-full font-medium",
                    active ? "bg-white text-[var(--accent)]" : "bg-zinc-200 text-zinc-600",
                  ].join(" ")}
                >
                  {c.pending}/{c.total}
                </span>
              </button>
            );
          })
        )}
      </div>
      <SunoLibraryPanel />
      <div className="p-2 border-t border-[var(--border)] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onAdd}
          className="w-full px-3 py-2 rounded-md border border-[var(--border-strong)] text-sm font-medium hover:bg-zinc-50"
        >
          + New Channel
        </button>
        <Link
          href="/settings"
          className="w-full px-3 py-2 rounded-md text-sm font-medium hover:bg-zinc-100 text-zinc-700 flex items-center justify-center gap-2"
        >
          ⚙ Settings
        </Link>
      </div>
    </aside>
  );
}

function decodeJwtExp(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8"),
    );
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function SunoLibraryPanel() {
  const [tokenSet, setTokenSet] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiry, setExpiry] = useState(null); // ms epoch | null
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();

  const checkToken = async () => {
    try {
      const sRes = await fetch("/api/settings", { cache: "no-store" });
      const sBody = await sRes.json();
      const set = !!sBody.settings.suno.libraryTokenSet;
      setTokenSet(set);
      if (!set) {
        setExpiry(null);
        return;
      }
      const tRes = await fetch("/api/suno/token", { cache: "no-store" });
      const tBody = await tRes.json();
      setExpiry(decodeJwtExp(tBody.token || ""));
    } catch {
      setExpiry(null);
    }
  };

  useEffect(() => {
    checkToken();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const expired = tokenSet && expiry !== null && expiry <= now;
  const expiringSoon =
    tokenSet && expiry !== null && !expired && expiry - now < 10 * 60 * 1000;
  const remainingLabel = (() => {
    if (!expiry) return null;
    const diff = expiry - now;
    if (diff <= 0) return "expired";
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h left`;
    return `${Math.round(hrs / 24)}d left`;
  })();

  const save = async () => {
    if (!tokenDraft.trim()) {
      toast("Paste a bearer token first", { tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suno: { libraryToken: tokenDraft.trim() } }),
      });
      if (!res.ok) throw new Error("Save failed");
      const body = await res.json();
      setTokenSet(!!body.settings.suno.libraryTokenSet);
      setExpiry(decodeJwtExp(tokenDraft.trim()));
      setNow(Date.now());
      setTokenDraft("");
      toast("Token saved", { tone: "success" });
    } catch (e) {
      toast(e.message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-[var(--border)] px-2 py-2 text-xs">
      <div className="flex flex-col gap-2">
        {expired ? (
          <div className="rounded border border-red-300 bg-red-50 text-red-700 px-2 py-1 text-[10px] leading-snug">
            ⚠ Token expired — paste a fresh one from suno.com.
          </div>
        ) : expiringSoon ? (
          <div className="rounded border border-amber-300 bg-amber-50 text-amber-700 px-2 py-1 text-[10px] leading-snug">
            ⚠ Token expires soon ({remainingLabel}).
          </div>
        ) : tokenSet && remainingLabel ? (
          <div className="text-[10px] text-emerald-700 leading-snug">
            ✓ Token valid · {remainingLabel}
          </div>
        ) : null}
        <textarea
          rows={3}
          placeholder={tokenSet ? "(saved — leave blank to keep)" : "paste bearer token"}
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
          className="border border-[var(--border-strong)] rounded px-2 py-1 font-mono text-[10px] w-full"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !tokenDraft.trim()}
          className="px-2.5 py-1 rounded bg-[var(--accent)] text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}
