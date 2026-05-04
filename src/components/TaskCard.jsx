"use client";

import { useState } from "react";
import { useToast } from "./Toast";

export function TaskCard({ task, isNext, onMarkUploaded, onEdit, onDelete }) {
  const cardClasses = [
    "flex flex-col gap-2.5 p-4 rounded-xl bg-white border shadow-sm",
    isNext ? "border-blue-300 ring-2 ring-blue-100" : "border-[var(--border)]",
    task.uploaded ? "opacity-90" : "",
  ].join(" ");

  return (
    <div className={cardClasses}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={[
            "text-[11px] font-semibold px-2 py-0.5 rounded-full tracking-wide",
            task.uploaded
              ? "bg-emerald-50 text-emerald-700"
              : "bg-[var(--accent-soft)] text-[var(--accent)]",
          ].join(" ")}
        >
          DAY {task.day}
          {isNext && !task.uploaded && " · NEXT"}
          {task.uploaded && " · DONE"}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-2 py-1 rounded text-sm"
            title="Edit"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            className="text-zinc-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded text-sm"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      <FieldBlock label="Title" value={task.title} kind="title" />
      <FieldBlock label="Suno Prompt" value={task.sunoPrompt} kind="suno" collapsible />
      <FieldBlock label="Thumbnail Text" value={task.thumbnailText} kind="thumbnail" />

      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {task.uploaded ? (
          <>
            <span className="text-xs text-emerald-600 mr-auto">
              ✓ Uploaded {task.uploadedAt ? new Date(task.uploadedAt).toLocaleDateString() : ""}
            </span>
            <button
              type="button"
              onClick={() => onMarkUploaded(task.id, false)}
              className="text-sm px-3 py-1.5 rounded-md border border-[var(--border-strong)] hover:bg-zinc-50"
            >
              Move back to pending
            </button>
          </>
        ) : (
          <>
            <span className="mr-auto" />
            <button
              type="button"
              onClick={() => onMarkUploaded(task.id, true)}
              className="text-sm px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            >
              ✓ Mark uploaded
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FieldBlock({ label, value, kind, collapsible = false }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const isCollapsed = collapsible && !expanded;
  const valueClasses =
    kind === "title"
      ? "font-semibold text-base"
      : kind === "suno"
        ? "font-mono text-[12.5px] text-zinc-700"
        : kind === "thumbnail"
          ? "font-semibold text-[15px] text-zinc-800"
          : "text-sm";
  const charCount = value ? value.length : 0;
  const hasValue = !!(value && value.length);

  const handleCopy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast("Copy failed", { tone: "error" });
    }
  };

  return (
    <div
      role="button"
      tabIndex={hasValue ? 0 : -1}
      aria-label={`Copy ${label}`}
      title={hasValue ? "Click to copy" : undefined}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCopy();
        }
      }}
      className={[
        "border rounded-md px-3 py-2 transition-colors outline-none",
        hasValue ? "cursor-pointer" : "cursor-default",
        copied
          ? "border-emerald-300 bg-emerald-50"
          : hasValue
            ? "bg-zinc-50 border-[var(--border)] hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-200"
            : "bg-zinc-50 border-[var(--border)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
        {copied ? (
          <span className="text-[11px] text-emerald-600 font-medium">✓ Copied</span>
        ) : (
          collapsible && charCount > 0 && (
            <span className="text-[10px] text-zinc-400">{charCount} chars</span>
          )
        )}
        {collapsible && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="ml-auto text-[11px] px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-white"
            aria-expanded={expanded}
          >
            {expanded ? "▴ Hide" : "▾ Show"}
          </button>
        )}
      </div>
      {!isCollapsed && (
        <div className={`mt-1 whitespace-pre-wrap break-words ${valueClasses} ${value ? "" : "text-zinc-400"}`}>
          {value || "—"}
        </div>
      )}
    </div>
  );
}
