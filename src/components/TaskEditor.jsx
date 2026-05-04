"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

export function TaskEditor({ open, task, channelId, defaultDay, onClose, onSaved }) {
  const isNew = !task;
  const [day, setDay] = useState("1");
  const [title, setTitle] = useState("");
  const [sunoPrompt, setSunoPrompt] = useState("");
  const [thumbnailText, setThumbnailText] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setDay(String(task?.day ?? defaultDay));
    setTitle(task?.title ?? "");
    setSunoPrompt(task?.sunoPrompt ?? "");
    setThumbnailText(task?.thumbnailText ?? "");
  }, [open, task, defaultDay]);

  const submit = async () => {
    if (!channelId) return;
    setBusy(true);
    try {
      const payload = {
        day: Number(day) || 1,
        title,
        sunoPrompt,
        thumbnailText,
      };
      const url = isNew ? `/api/channels/${channelId}/tasks` : `/api/tasks/${task.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      toast(isNew ? "Task added" : "Saved", { tone: "success" });
      onSaved();
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
        if (!busy) onClose();
      }}
      title={isNew ? "Add Task" : "Edit Task"}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={() => !busy && onClose()}
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
            {busy ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
        </>
      }
    >
      <Field label="Day">
        <input
          type="text"
          value={day}
          onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-24 px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </Field>
      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </Field>
      <Field label="Suno Prompt">
        <textarea
          value={sunoPrompt}
          onChange={(e) => setSunoPrompt(e.target.value)}
          rows={3}
          className="w-full font-mono text-xs px-3 py-2 border border-[var(--border-strong)] rounded-md focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </Field>
      <Field label="Thumbnail Text">
        <textarea
          value={thumbnailText}
          onChange={(e) => setThumbnailText(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
          placeholder="Bold text that goes on the thumbnail"
        />
      </Field>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
