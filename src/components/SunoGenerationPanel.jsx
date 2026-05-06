"use client";

import { useEffect, useRef, useState } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { useToast } from "./Toast";

const POLL_MS = 8000;
const TIMEOUT_MS = 30 * 60 * 1000;

export function SunoGenerationPanel({ task, channel, onTaskUpdated }) {
  const gen = task.sunoGeneration ?? null;
  const status = gen?.status ?? "idle";

  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [autoExport, setAutoExport] = useState(false);
  const [exportInfo, setExportInfo] = useState(null);
  const toast = useToast();
  const pollRef = useRef(null);
  const exportingRef = useRef(false);

  const isStale =
    status === "generating" &&
    gen?.startedAt &&
    Date.now() - gen.startedAt > TIMEOUT_MS;

  useEffect(() => {
    if (status !== "generating") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setElapsed(0);
      return;
    }
    if (isStale) return;

    const tick = async () => {
      try {
        const res = await fetch(`/api/suno/status/${task.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (body.task) onTaskUpdated(body.task);
      } catch {}
    };
    tick();
    pollRef.current = setInterval(tick, POLL_MS);
    const startedAt = gen?.startedAt ?? Date.now();
    const e = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => {
      clearInterval(pollRef.current);
      pollRef.current = null;
      clearInterval(e);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, task.id, isStale]);

  useEffect(() => {
    if (status !== "complete" || !autoExport || exportingRef.current) return;
    if (!gen?.clips?.length) return;
    exportingRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/suno/export/${task.id}`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Export failed");
        setExportInfo(body);
        toast(`Saved ${body.exported} track${body.exported === 1 ? "" : "s"} to ${body.folderName}`, { tone: "success" });
      } catch (e) {
        toast(e.message, { tone: "error" });
      } finally {
        setAutoExport(false);
        exportingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoExport, gen?.clips?.length, task.id]);

  const startGenerate = async (opts = {}) => {
    if (!task.sunoPrompt?.trim()) {
      toast("Task has no Suno prompt", { tone: "error" });
      return;
    }
    if (opts.autoExport !== false) {
      setExportInfo(null);
      setAutoExport(true);
    }
    setBusy(true);
    try {
      // 1) Pull the saved bearer token from settings.
      const tokRes = await fetch("/api/suno/token", { cache: "no-store" });
      const tokBody = await tokRes.json().catch(() => ({}));
      const token = tokBody.token || "";
      if (!token) throw new Error("Save your Suno bearer token in the sidebar first.");

      // 2) Build the payload. Title falls back to "{Channel} - Day {N}".
      const title =
        (task.title || "").trim() ||
        `${(channel?.name || "Channel").trim()} - Day ${task.day}`;
      const weirdness =
        typeof channel?.sunoWeirdness === "number" ? channel.sunoWeirdness : 30;
      const styleInfluence =
        typeof channel?.sunoStyleInfluence === "number"
          ? channel.sunoStyleInfluence
          : 70;
      const payload = {
        prompt: task.sunoPrompt,
        tags: channel?.sunoStyle ?? "",
        negative_tags: channel?.sunoExcludeStyle ?? "",
        title,
        mv: "chirp-v4-5",
        make_instrumental: false,
        continue_clip_id: null,
        continue_at: null,
        infill_start_s: null,
        infill_end_s: null,
        task: null,
        metadata: {
          style_weight: Math.max(0, Math.min(1, styleInfluence / 100)),
          weirdness_constraint: Math.max(0, Math.min(1, weirdness / 100)),
        },
      };

      // 3) Fire `count` direct calls to suno.com from the browser. You can
      //    inspect the exact request and response in DevTools → Network.
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const settled = await Promise.allSettled(
        Array.from({ length: count }, async () => {
          const r = await fetch(
            "https://studio-api-prod.suno.com/api/generate/v3/",
            { method: "POST", headers, body: JSON.stringify(payload) },
          );
          const text = await r.text();
          let data;
          try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
          if (!r.ok) {
            const detail =
              (data?.detail && (Array.isArray(data.detail)
                ? data.detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join(" | ")
                : JSON.stringify(data.detail))) ||
              data?.error ||
              data?.message ||
              text.slice(0, 400) ||
              "unknown";
            throw new Error(`Suno ${r.status}: ${detail}`);
          }
          const clips = Array.isArray(data) ? data : data?.clips ?? [];
          const clipIds = clips.map((c) => c?.id).filter(Boolean);
          if (!clipIds.length) throw new Error("Suno returned no clip IDs");
          return clipIds;
        }),
      );

      const runs = settled.map((r) =>
        r.status === "fulfilled"
          ? { clipIds: r.value, error: null }
          : { clipIds: [], error: String(r.reason?.message || r.reason) },
      );

      // 4) Persist runs server-side; status polling takes over.
      const recRes = await fetch(`/api/suno/runs/${task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs }),
      });
      const recBody = await recRes.json().catch(() => ({}));
      if (!recRes.ok) throw new Error(recBody.error || "Could not record runs");
      onTaskUpdated({ ...task, sunoGeneration: recBody.sunoGeneration });

      const ok = runs.filter((r) => r.clipIds.length).length;
      const fail = runs.length - ok;
      if (ok === 0) {
        throw new Error(runs[0]?.error || "All runs failed");
      }
      toast(
        fail
          ? `${ok}/${runs.length} runs started · ${fail} failed`
          : `Generation started (${ok} run${ok > 1 ? "s" : ""})`,
        { tone: fail ? "error" : "success" },
      );
    } catch (e) {
      toast(e.message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await fetch(`/api/suno/audio/${task.id}`, { method: "DELETE" });
      onTaskUpdated({ ...task, sunoGeneration: null });
    } finally {
      setBusy(false);
    }
  };

  const removeAudio = async () => {
    if (!confirm("Remove all generated audio for this task?")) return;
    await reset();
    toast("Audio removed", { tone: "success" });
  };

  // ---- complete: render every clip ----
  if (status === "complete" && gen?.clips?.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] text-zinc-500">
          {gen.clips.length} track{gen.clips.length !== 1 ? "s" : ""} ready
          {gen.runs?.some((r) => r.status === "error") && " · some runs failed"}
        </div>
        {gen.clips.map((c) => (
          <AudioPlayer
            key={c.idx}
            src={`/api/suno/audio/${task.id}?i=${c.idx}`}
            filename={c.filename}
            duration={c.duration}
            ext={c.ext}
          />
        ))}
        <div className="flex gap-2 flex-wrap items-center">
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:bg-zinc-50 disabled:opacity-50"
          >
            ↻ Regenerate
          </button>
          <button
            type="button"
            disabled={busy || exportingRef.current}
            onClick={async () => {
              try {
                const res = await fetch(`/api/suno/export/${task.id}`, { method: "POST" });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || "Export failed");
                setExportInfo(body);
                toast(`Saved ${body.exported} track${body.exported === 1 ? "" : "s"} to ${body.folderName}`, { tone: "success" });
              } catch (e) {
                toast(e.message, { tone: "error" });
              }
            }}
            className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:bg-zinc-50 disabled:opacity-50"
            title={`Copy clips to ./${(channel?.name || "channel").replace(/[\\/:*?"<>|]/g, "")}-${task.day}/`}
          >
            ⬇ Save to folder
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={removeAudio}
            className="text-[11px] px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            ✕ Remove all
          </button>
          {exportInfo && (
            <span className="text-[10px] text-emerald-700 truncate" title={exportInfo.folder}>
              ✓ {exportInfo.folderName}/
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- generating ----
  if (status === "generating") {
    if (isStale) {
      return (
        <div className="flex items-center gap-2 text-[12px] bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <span className="text-amber-700">⚠ Generation timed out</span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto text-[11px] px-2 py-1 rounded border border-amber-300 hover:bg-amber-100"
          >
            Reset
          </button>
        </div>
      );
    }
    const totalRuns = gen?.runs?.length ?? 0;
    const doneRuns = gen?.runs?.filter((r) => r.status !== "pending").length ?? 0;
    const clipsReady = gen?.clips?.length ?? 0;
    return (
      <div className="flex items-center gap-2 text-[12px] bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-blue-700">
          Generating · {doneRuns}/{totalRuns} runs · {clipsReady} track{clipsReady !== 1 ? "s" : ""} downloaded
        </span>
        <span className="text-blue-500/70">{elapsed}s</span>
        <button
          type="button"
          onClick={reset}
          className="ml-auto text-[11px] px-2 py-0.5 rounded text-blue-700 hover:bg-blue-100"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ---- error ----
  if (status === "error") {
    return (
      <div className="flex items-start gap-2 text-[12px] bg-red-50 border border-red-200 rounded-md px-3 py-2">
        <div className="flex-1">
          <div className="text-red-700 font-medium">Generation failed</div>
          {gen?.error && <div className="text-red-600 mt-0.5 break-words">{gen.error}</div>}
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-[11px] px-2 py-1 rounded border border-red-300 hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }


  return (
    <div className="bg-white border border-[var(--border)] rounded-md p-2.5 flex items-center gap-3 text-[12px]">
      <button
        type="button"
        disabled={busy || !task.sunoPrompt?.trim()}
        onClick={() => startGenerate()}
        title={
          task.sunoPrompt?.trim()
            ? `Generate then auto-save to ./${(channel?.name || "channel").replace(/[\\/:*?"<>|]/g, "")}-${task.day}/`
            : "Add a Suno prompt first"
        }
        className="text-[12px] px-3 py-1 rounded-md bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Starting…" : "♪ Generate"}
      </button>
      <label className="flex items-center gap-1.5 ml-auto">
        <input
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) =>
            setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
          }
          className="w-14 border border-[var(--border-strong)] rounded px-2 py-0.5"
        />
        <span className="text-zinc-400">× 2 = {count * 2} tracks</span>
      </label>
    </div>
  );
}
