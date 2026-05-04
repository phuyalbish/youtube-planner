"use client";

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
      <div className="p-2 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onAdd}
          className="w-full px-3 py-2 rounded-md border border-[var(--border-strong)] text-sm font-medium hover:bg-zinc-50"
        >
          + New Channel
        </button>
      </div>
    </aside>
  );
}
