"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TaskCard } from "./TaskCard";
import { Modal } from "./Modal";
import { ImportModal } from "./ImportModal";
import { TaskEditor } from "./TaskEditor";
import { useToast } from "./Toast";
import { CopyButton } from "./CopyButton";
import { logout } from "./AuthGate";

/* eslint-disable react-hooks/exhaustive-deps */

export function Dashboard() {
  const [channels, setChannels] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);

  const [showAddChannel, setShowAddChannel] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editorTask, setEditorTask] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [presetEditing, setPresetEditing] = useState(null); // {id?, label, content} | null
  const [menuOpen, setMenuOpen] = useState(false);

  const toast = useToast();

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeId) ?? null,
    [channels, activeId],
  );

  const refreshChannels = useCallback(async () => {
    const res = await fetch("/api/channels", { cache: "no-store" });
    const body = await res.json();
    setChannels(body.channels);
    return body.channels;
  }, []);

  const refreshTasks = useCallback(async (channelId) => {
    const res = await fetch(`/api/channels/${channelId}/tasks`, { cache: "no-store" });
    const body = await res.json();
    if (res.ok) setTasks(body.tasks);
  }, []);

  useEffect(() => {
    (async () => {
      const list = await refreshChannels();
      if (list.length && !activeId) setActiveId(list[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setTasks([]);
      return;
    }
    refreshTasks(activeId);
  }, [activeId, refreshTasks]);

  const reloadAll = useCallback(async () => {
    await refreshChannels();
    if (activeId) await refreshTasks(activeId);
  }, [activeId, refreshChannels, refreshTasks]);

  const handleAddChannel = async (name) => {
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast(body.error || "Could not create channel", { tone: "error" });
      return;
    }
    await refreshChannels();
    setActiveId(body.channel.id);
    toast("Channel created", { tone: "success" });
  };

  const handleRename = async (newName) => {
    if (!activeChannel) return;
    const res = await fetch(`/api/channels/${activeChannel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) {
      toast("Rename failed", { tone: "error" });
      return;
    }
    await refreshChannels();
    toast("Renamed", { tone: "success" });
  };

  const handleEditDescription = async (description) => {
    if (!activeChannel) return;
    const res = await fetch(`/api/channels/${activeChannel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) {
      toast("Could not save description", { tone: "error" });
      return;
    }
    await refreshChannels();
    toast("Description saved", { tone: "success" });
  };

  const savePresets = async (nextPresets) => {
    if (!activeChannel) return;
    const res = await fetch(`/api/channels/${activeChannel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presets: nextPresets }),
    });
    if (!res.ok) {
      toast("Could not save preset", { tone: "error" });
      return;
    }
    await refreshChannels();
  };

  const handleSavePreset = async ({ id, label, content }) => {
    if (!activeChannel) return;
    const list = Array.isArray(activeChannel.presets) ? activeChannel.presets : [];
    const next = id
      ? list.map((p) => (p.id === id ? { ...p, label, content } : p))
      : [...list, { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label, content }];
    await savePresets(next);
    toast(id ? "Preset saved" : "Preset added", { tone: "success" });
  };

  const handleDeletePreset = async (id) => {
    if (!activeChannel) return;
    if (!confirm("Delete this preset?")) return;
    const list = Array.isArray(activeChannel.presets) ? activeChannel.presets : [];
    await savePresets(list.filter((p) => p.id !== id));
    toast("Preset deleted", { tone: "success" });
  };

  const handleDeleteChannel = async () => {
    if (!activeChannel) return;
    if (!confirm(`Delete "${activeChannel.name}" and all its tasks? This cannot be undone.`)) return;
    const res = await fetch(`/api/channels/${activeChannel.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Delete failed", { tone: "error" });
      return;
    }
    const list = await refreshChannels();
    setActiveId(list[0]?.id ?? null);
    toast("Channel deleted", { tone: "success" });
  };

  const handleExport = () => {
    if (!activeChannel) return;
    window.location.href = `/api/channels/${activeChannel.id}/export`;
  };

  const handleMarkUploaded = async (id, uploaded) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, uploaded, uploadedAt: uploaded ? Date.now() : null } : t)),
    );
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploaded }),
    });
    if (!res.ok) {
      toast("Update failed", { tone: "error" });
      reloadAll();
      return;
    }
    refreshChannels();
    toast(uploaded ? "Marked as uploaded" : "Moved back to pending", { tone: "success" });
  };

  const handleDeleteTask = async (id) => {
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Delete failed", { tone: "error" });
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    refreshChannels();
  };

  const filteredTasks = useMemo(() => {
    if (filter === "pending") return tasks.filter((t) => !t.uploaded);
    if (filter === "uploaded") return tasks.filter((t) => t.uploaded);
    return tasks;
  }, [tasks, filter]);

  const nextId = useMemo(() => {
    if (filter === "uploaded") return null;
    return filteredTasks.find((t) => !t.uploaded)?.id ?? null;
  }, [filteredTasks, filter]);

  const counts = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => !t.uploaded).length;
    return { total, pending, uploaded: total - pending };
  }, [tasks]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [activeId, filter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageTasks = useMemo(
    () => filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTasks, page],
  );

  const nextDay = useMemo(() => {
    const used = new Set(tasks.map((t) => t.day));
    let d = 1;
    while (used.has(d)) d++;
    return d;
  }, [tasks]);

  return (
    <div className="grid grid-cols-[256px_1fr] h-screen">
      <Sidebar
        channels={channels}
        activeId={activeId}
        onSelect={(id) => setActiveId(id)}
        onAdd={() => setShowAddChannel(true)}
      />

      <main className="flex flex-col min-h-0">
        {!activeChannel ? (
          loading ? (
            <Empty title="Loading…" body="" />
          ) : (
            <Empty
              title="Welcome"
              body="Create your first channel to start planning uploads."
              action={
                <button
                  type="button"
                  onClick={() => setShowAddChannel(true)}
                  className="text-sm px-4 py-2 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700"
                >
                  + Create Channel
                </button>
              }
            />
          )
        ) : (
          <>
            <div className="flex items-center gap-3 px-6 py-3.5 bg-white border-b border-[var(--border)]">
              <div>
                <button
                  type="button"
                  onClick={() => setShowRename(true)}
                  className="text-[17px] font-semibold m-0 hover:bg-zinc-100 rounded px-1 -mx-1 py-0 text-left"
                  title="Click to rename"
                >
                  {activeChannel.name}
                </button>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {counts.pending} pending · {counts.uploaded} uploaded
                </div>
              </div>
              <div className="flex-1" />
              <div className="inline-flex bg-zinc-100 p-0.5 rounded-md">
                <Tab f="pending" current={filter} setFilter={setFilter} count={counts.pending} />
                <Tab f="uploaded" current={filter} setFilter={setFilter} count={counts.uploaded} />
                <Tab f="all" current={filter} setFilter={setFilter} count={counts.total} />
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-zinc-50 text-sm"
                  aria-label="Channel menu"
                >
                  ⋯
                </button>
                {menuOpen && (
                  <ChannelMenu
                    onClose={() => setMenuOpen(false)}
                    onImport={() => setShowImport(true)}
                    onAddTask={() => {
                      setEditorTask(null);
                      setShowEditor(true);
                    }}
                    onRename={() => setShowRename(true)}
                    onEditDescription={() => setShowDescription(true)}
                    onExport={handleExport}
                    onDelete={handleDeleteChannel}
                    onLogout={logout}
                  />
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-3xl mx-auto mb-4 flex flex-col gap-3">
                {(activeChannel.presets ?? []).map((p) => (
                  <PresetPanel
                    key={p.id}
                    preset={p}
                    onEdit={() => setPresetEditing(p)}
                    onDelete={() => handleDeletePreset(p.id)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setPresetEditing({ label: "", content: "" })}
                  className="self-start text-sm px-3 py-1.5 rounded-md border border-dashed border-[var(--border-strong)] hover:bg-zinc-50 text-zinc-700"
                >
                  + Add preset prompt
                </button>
              </div>
              {tasks.length === 0 ? (
                <Empty
                  title={`No tasks yet for ${activeChannel.name}`}
                  body="Import a JSON file with your monthly plan, or add a task manually."
                  action={
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowImport(true)}
                        className="text-sm px-4 py-2 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700"
                      >
                        Import JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditorTask(null);
                          setShowEditor(true);
                        }}
                        className="text-sm px-4 py-2 rounded-md border border-[var(--border-strong)] hover:bg-zinc-50"
                      >
                        + Add Task
                      </button>
                    </div>
                  }
                />
              ) : filteredTasks.length === 0 ? (
                <Empty
                  title={filter === "pending" ? "All caught up" : "Nothing here"}
                  body={
                    filter === "pending"
                      ? "You've uploaded everything in this channel."
                      : "No tasks match this filter."
                  }
                />
              ) : (
                <div className="max-w-3xl mx-auto flex flex-col gap-3.5">
                  {pageTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      isNext={t.id === nextId}
                      onMarkUploaded={handleMarkUploaded}
                      onEdit={(task) => {
                        setEditorTask(task);
                        setShowEditor(true);
                      }}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </div>
              )}
            </div>

            {tasks.length > 0 && filteredTasks.length > 0 && (
              <FooterBar
                page={page}
                totalPages={totalPages}
                total={filteredTasks.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                onImport={() => setShowImport(true)}
                onAddTask={() => {
                  setEditorTask(null);
                  setShowEditor(true);
                }}
              />
            )}
          </>
        )}
      </main>

      <NameModal
        open={showAddChannel}
        title="New Channel"
        placeholder="e.g. Morning Ragas"
        submitLabel="Create"
        onClose={() => setShowAddChannel(false)}
        onSubmit={async (name) => {
          await handleAddChannel(name);
        }}
      />

      <NameModal
        open={showRename}
        title="Rename Channel"
        placeholder="Channel name"
        submitLabel="Save"
        initialValue={activeChannel?.name ?? ""}
        onClose={() => setShowRename(false)}
        onSubmit={handleRename}
      />

      <PresetModal
        open={!!presetEditing}
        initial={presetEditing}
        onClose={() => setPresetEditing(null)}
        onSubmit={handleSavePreset}
      />

      <DescriptionModal
        open={showDescription}
        initialValue={activeChannel?.description ?? ""}
        onClose={() => setShowDescription(false)}
        onSubmit={handleEditDescription}
      />

      <ImportModal
        open={showImport}
        channelId={activeChannel?.id ?? null}
        channelName={activeChannel?.name ?? ""}
        onClose={() => setShowImport(false)}
        onImported={reloadAll}
      />

      <TaskEditor
        open={showEditor}
        task={editorTask}
        channelId={activeChannel?.id ?? null}
        defaultDay={nextDay}
        onClose={() => {
          setShowEditor(false);
          setEditorTask(null);
        }}
        onSaved={reloadAll}
      />
    </div>
  );
}

function Tab({ f, current, setFilter, count }) {
  const active = current === f;
  return (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={[
        "text-sm px-3 py-1 rounded transition-colors flex items-center gap-1.5",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
      ].join(" ")}
    >
      <span className="capitalize">{f}</span>
      <span
        className={[
          "text-[10px] px-1.5 py-0.5 rounded-full",
          active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-zinc-200 text-zinc-600",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}

function ChannelMenu({ onClose, onImport, onAddTask, onRename, onEditDescription, onExport, onDelete, onLogout }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-48 bg-white border border-[var(--border)] rounded-md shadow-lg p-1 z-20"
    >
      <MenuItem label="Import JSON…" onClick={() => { onClose(); onImport(); }} />
      <MenuItem label="+ Add task manually" onClick={() => { onClose(); onAddTask(); }} />
      <MenuItem label="Edit description" onClick={() => { onClose(); onEditDescription(); }} />
      <MenuItem label="Rename channel" onClick={() => { onClose(); onRename(); }} />
      <MenuItem label="Export channel JSON" onClick={() => { onClose(); onExport(); }} />
      <MenuItem
        label="Delete channel"
        onClick={() => { onClose(); onDelete(); }}
        className="text-red-600 hover:bg-red-50"
      />
      <div className="border-t border-[var(--border)] my-1" />
      <MenuItem label="Log out" onClick={() => { onClose(); onLogout(); }} />
    </div>
  );
}

function ChannelDescriptionPanel({ description, onEdit }) {
  const toast = useToast();
  const empty = !description || !description.trim();
  const copy = async () => {
    if (empty) return;
    try {
      await navigator.clipboard.writeText(description);
      toast("Copied", { tone: "success" });
    } catch {
      toast("Copy failed", { tone: "error" });
    }
  };
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Channel description
        </span>
        <span className="text-[11px] text-zinc-400">· used for every video</span>
        <div className="ml-auto flex items-center gap-1">
          {!empty && <CopyButton text={description} />}
          <button
            type="button"
            onClick={onEdit}
            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-2 py-0.5 rounded text-[11px]"
            title="Edit description"
          >
            ✎ Edit
          </button>
        </div>
      </div>
      {empty ? (
        <button
          type="button"
          onClick={onEdit}
          className="w-full text-left text-sm text-zinc-400 italic hover:text-zinc-600"
        >
          No description yet — click to add one. Every video on this channel will use it.
        </button>
      ) : (
        <button
          type="button"
          onClick={copy}
          className="w-full text-left whitespace-pre-wrap break-words text-sm text-zinc-800 hover:bg-zinc-50 rounded px-1 -mx-1 py-0.5 cursor-pointer"
          title="Click to copy"
        >
          {description}
        </button>
      )}
    </div>
  );
}

function AutoGrowTextarea({ value, onChange, placeholder, autoFocus, minRows = 4 }) {
  const ref = useRef(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // Cap so the textarea never pushes the modal past viewport — leave headroom for header/footer.
    const max = Math.max(200, window.innerHeight - 260);
    const next = Math.min(el.scrollHeight, max);
    el.style.height = next + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);
  useEffect(() => {
    resize();
  }, [value, resize]);
  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resize]);
  return (
    <textarea
      ref={ref}
      autoFocus={autoFocus}
      value={value}
      onChange={onChange}
      rows={minRows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none whitespace-pre-wrap resize-none"
    />
  );
}

function FooterBar({ page, totalPages, total, pageSize, onPage, onImport, onAddTask }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-white px-4 py-1.5 flex items-center gap-3 text-xs">
      <span className="text-zinc-500">
        {start}–{end} of {total}
      </span>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="text-zinc-600 px-1">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Next page"
        >
          ›
        </button>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onImport}
        className="px-2.5 py-1 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700"
      >
        Import more JSON
      </button>
      <button
        type="button"
        onClick={onAddTask}
        className="px-2.5 py-1 rounded-md border border-[var(--border-strong)] hover:bg-zinc-50"
      >
        + Add task
      </button>
    </div>
  );
}

function PresetPanel({ preset, onEdit, onDelete }) {
  const toast = useToast();
  const empty = !preset.content || !preset.content.trim();
  const copy = async () => {
    if (empty) return;
    try {
      await navigator.clipboard.writeText(preset.content);
      toast("Copied", { tone: "success" });
    } catch {
      toast("Copy failed", { tone: "error" });
    }
  };
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role={empty ? undefined : "button"}
      tabIndex={empty ? undefined : 0}
      onClick={empty ? undefined : copy}
      onKeyDown={
        empty
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                copy();
              }
            }
      }
      title={empty ? undefined : "Click to copy"}
      className={[
        "bg-white border border-[var(--border)] rounded-xl shadow-sm px-4 py-3 transition-colors",
        empty ? "" : "cursor-pointer hover:bg-zinc-50 hover:border-[var(--border-strong)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider truncate">
          {preset.label || "Untitled preset"}
        </span>
        {!empty && <span className="text-[11px] text-zinc-400">· click tile to copy</span>}
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {!empty && <CopyButton text={preset.content} />}
          <button
            type="button"
            onClick={stop(onEdit)}
            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-2 py-0.5 rounded text-[11px]"
            title="Edit preset"
          >
            ✎ Edit
          </button>
          <button
            type="button"
            onClick={stop(onDelete)}
            className="text-zinc-500 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded text-[11px]"
            title="Delete preset"
          >
            ✕
          </button>
        </div>
      </div>
      {empty ? (
        <button
          type="button"
          onClick={onEdit}
          className="w-full text-left text-sm text-zinc-400 italic hover:text-zinc-600"
        >
          Empty preset — click to add content.
        </button>
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm text-zinc-800">
          {preset.content}
        </div>
      )}
    </div>
  );
}

function PresetModal({ open, initial, onClose, onSubmit }) {
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "");
      setContent(initial?.content ?? "");
    }
  }, [open, initial]);

  const submit = async () => {
    const l = label.trim();
    if (!l) return;
    setBusy(true);
    try {
      await onSubmit({ id: initial?.id, label: l, content });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={initial?.id ? "Edit Preset" : "New Preset"}
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
            disabled={busy || !label.trim()}
            className="text-sm px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <p className="text-xs text-zinc-500 mb-2">
        A reusable snippet (like a hashtag block or pinned-comment template). Click the preset on
        the dashboard to copy its content.
      </p>
      <input
        autoFocus
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Hashtags, Pinned Comment)"
        className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none mb-2"
      />
      <AutoGrowTextarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Preset text…"
      />
    </Modal>
  );
}

function DescriptionModal({ open, initialValue, onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Channel Description"
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
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <p className="text-xs text-zinc-500 mb-2">
        This description is shared by every video on this channel. Use the Copy button on the
        dashboard to paste it into YouTube.
      </p>
      <AutoGrowTextarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Welcome to Morning Ragas — daily peaceful sitar music for meditation and study."
      />
    </Modal>
  );
}

function MenuItem({ label, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left text-sm px-2.5 py-1.5 rounded hover:bg-zinc-100 ${className}`}
    >
      {label}
    </button>
  );
}

function NameModal({ open, title, placeholder, submitLabel, initialValue = "", onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onSubmit(v);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
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
            disabled={busy || !value.trim()}
            className="text-sm px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Working…" : submitLabel}
          </button>
        </>
      }
    >
      <input
        autoFocus
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-md text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-100 outline-none"
      />
    </Modal>
  );
}

function Empty({ title, body, action }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 text-zinc-500">
      <h3 className="text-zinc-900 font-semibold m-0 mb-1.5">{title}</h3>
      {body && <p className="m-0 mb-4 text-sm max-w-sm">{body}</p>}
      {action}
    </div>
  );
}
