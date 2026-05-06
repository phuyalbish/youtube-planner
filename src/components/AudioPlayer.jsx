"use client";

export function AudioPlayer({ src, filename, duration, ext = "wav" }) {
  return (
    <div className="bg-zinc-50 border border-[var(--border)] rounded-md px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
          ♪ Audio
        </span>
        <span className="text-[11px] text-zinc-500 truncate">{filename}</span>
        {duration ? (
          <span className="text-[11px] text-zinc-400">
            {Math.round(duration)}s
          </span>
        ) : null}
        <span className="text-[10px] uppercase text-zinc-400 ml-auto">{ext}</span>
        <a
          href={src}
          download={filename}
          className="text-[11px] px-2 py-0.5 rounded text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
          title="Download"
        >
          ⬇
        </a>
      </div>
      <audio
        controls
        preload="metadata"
        src={src}
        className="w-full h-8"
      />
    </div>
  );
}
