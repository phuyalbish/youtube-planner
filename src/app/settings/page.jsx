"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/Theme";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="bg-white border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-zinc-50"
          >
            ← Back
          </Link>
          <h1 className="text-[18px] font-semibold m-0">Settings</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
        <AppearanceSection />
        <SunoSection />
        <SystemSection />
      </main>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="bg-white border border-[var(--border)] rounded-xl shadow-sm">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold m-0">{title}</h2>
        {description && (
          <p className="text-xs text-zinc-500 m-0 mt-1">{description}</p>
        )}
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:gap-4 sm:items-start">
      <div className="pt-1.5">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

/* ---------- Appearance ---------- */

function AppearanceSection() {
  const { theme, toggle } = useTheme();
  return (
    <Section
      title="Appearance"
      description="How the dashboard looks on this device. Stored locally."
    >
      <Row label="Theme" hint="Toggle light / dark mode.">
        <div className="inline-flex bg-zinc-100 p-0.5 rounded-md w-fit">
          <ThemeChip active={theme === "light"} onClick={() => theme !== "light" && toggle()}>
            Light
          </ThemeChip>
          <ThemeChip active={theme === "dark"} onClick={() => theme !== "dark" && toggle()}>
            Dark
          </ThemeChip>
        </div>
      </Row>
    </Section>
  );
}

function ThemeChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-sm px-3 py-1 rounded transition-colors",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}


/* ---------- Suno ---------- */

function SunoSection() {
  const [format, setFormat] = useState("wav");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((body) => {
        const f = body.settings?.suno?.libraryDownloadFormat;
        if (f === "mp3" || f === "wav") setFormat(f);
      });
  }, []);

  const save = async (f) => {
    setFormat(f);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suno: { libraryDownloadFormat: f } }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Section
      title="Suno"
      description="Settings for downloading music from your Suno library."
    >
      <Row label="Download format" hint="File format for library downloads.">
        <div className="inline-flex bg-zinc-100 p-0.5 rounded-md w-fit">
          <ThemeChip active={format === "wav"} onClick={() => format !== "wav" && save("wav")}>
            WAV
          </ThemeChip>
          <ThemeChip active={format === "mp3"} onClick={() => format !== "mp3" && save("mp3")}>
            MP3
          </ThemeChip>
        </div>
        {saved && <span className="text-[11px] text-emerald-700 mt-1">Saved</span>}
      </Row>
    </Section>
  );
}

/* ---------- System ---------- */

function SystemSection() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "info" }),
    })
      .then((r) => r.json())
      .then(setInfo);
  }, []);

  return (
    <Section
      title="System"
      description="Read-only view of how the local install is wired up."
    >
      {!info ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <>
          <Row label="ffmpeg">
            <span
              className={`text-sm ${info.ffmpeg ? "text-emerald-700" : "text-red-700"}`}
            >
              {info.ffmpeg
                ? `✓ Available (${info.ffmpegPath})`
                : `✕ Not found — falls back to MP3 (set FFMPEG_PATH)`}
            </span>
          </Row>
          <Row label="Audio storage">
            <code className="text-xs font-mono text-zinc-700 break-all">{info.audioDir}</code>
          </Row>
          <Row label="Data file">
            <code className="text-xs font-mono text-zinc-700 break-all">{info.dataFile}</code>
          </Row>
          <Row label="Runtime">
            <span className="text-xs text-zinc-600">
              Node {info.node} on {info.platform}
            </span>
          </Row>
        </>
      )}
    </Section>
  );
}
