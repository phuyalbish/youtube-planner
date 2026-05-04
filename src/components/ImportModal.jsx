"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

export function ImportModal({ open, channelId, channelName, onClose, onImported }) {
  const [json, setJson] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const toast = useToast();

  const reset = () => {
    setJson("");
    setReplace(false);
    setBusy(false);
  };

  const submit = async () => {
    if (!channelId) return;
    if (!json.trim()) {
      toast("Paste or upload JSON first", { tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json, replace }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Import failed");
      toast(`Imported ${body.count} tasks`, { tone: "success" });
      onImported();
      reset();
      onClose();
    } catch (e) {
      toast(e.message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title={`Import JSON for ${channelName}`}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              if (!busy) {
                reset();
                onClose();
              }
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-zinc-100"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </>
      }
    >
      <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3 text-[12.5px] text-amber-800">
        Just an array of tasks. Each task needs{" "}
        <code className="bg-black/5 px-1 rounded text-[11.5px]">title</code>,{" "}
        <code className="bg-black/5 px-1 rounded text-[11.5px]">suno_prompt</code>, and{" "}
        <code className="bg-black/5 px-1 rounded text-[11.5px]">thumbnail_text</code>. Days are
        auto-assigned (next available slot in this channel) and editable per task.
      </div>

      <label
        className={[
          "block border-2 border-dashed rounded-md p-5 text-center cursor-pointer text-sm",
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border-strong)] text-zinc-500 hover:bg-zinc-50",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setJson(await f.text());
        }}
      >
        Click or drop a .json file
        <input
          type="file"
          accept="application/json,.json,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setJson(await f.text());
            e.target.value = "";
          }}
        />
      </label>

      <label className="block mt-4">
        <span className="block text-xs font-medium text-zinc-500 mb-1">Or paste JSON</span>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={10}
          className="w-full font-mono text-xs px-3 py-2 border border-[var(--border-strong)] rounded-md focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
          placeholder={`[
  {"title": "Morning Raga", "suno_prompt": "...", "thumbnail_text": "DAY 1"},
  {"title": "Evening Raga", "suno_prompt": "...", "thumbnail_text": "DAY 2"}
]`}
        />
      </label>

      <label className="flex items-center gap-2 mt-3 text-sm text-zinc-600">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace existing tasks (otherwise append)
      </label>
    </Modal>
  );
}
