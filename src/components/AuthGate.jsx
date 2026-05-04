"use client";

import { useEffect, useState } from "react";

// SHA-256 of the access password. The plaintext password is shared with the
// owner separately — change this hash to rotate the password.
//   default password: planner-2026
const PASSWORD_HASH =
  "c6a9b0066f2855a7857a6519c367deaa56cf4f68926e1e2962dc3c87a3eb8faa";

const STORAGE_KEY = "planner_auth_v1";

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function AuthGate({ children }) {
  const [status, setStatus] = useState("checking"); // "checking" | "locked" | "unlocked"
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === PASSWORD_HASH) {
        setStatus("unlocked");
        return;
      }
    } catch {
      // localStorage may be blocked — fall through to locked.
    }
    setStatus("locked");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const hashed = await sha256Hex(password);
      if (hashed === PASSWORD_HASH) {
        try {
          localStorage.setItem(STORAGE_KEY, hashed);
        } catch {
          // ignore — session-only is fine
        }
        setStatus("unlocked");
      } else {
        setError("Incorrect password.");
        setPassword("");
      }
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400 text-sm">
        …
      </div>
    );
  }

  if (status === "unlocked") return children;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-[var(--border)] rounded-2xl shadow-sm p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="w-9 h-9" />
          <div>
            <h1 className="text-[17px] font-semibold m-0">Upload Planner</h1>
            <p className="text-xs text-zinc-500 m-0 mt-0.5">
              Enter password to continue
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw" className="text-xs font-medium text-zinc-600">
            Password
          </label>
          <input
            id="pw"
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
            autoComplete="current-password"
          />
          {error && (
            <span className="text-xs text-red-600 mt-0.5">{error}</span>
          )}
        </div>
        <button
          type="submit"
          disabled={busy || !password}
          className="text-sm px-3 py-2 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export function logout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") window.location.reload();
}
