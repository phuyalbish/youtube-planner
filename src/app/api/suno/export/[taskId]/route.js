import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getChannel, getTask } from "@/lib/db";
import { audioPathFor } from "@/lib/audio";

export const runtime = "nodejs";

function sanitizeFolder(s) {
  return (s || "untitled")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "untitled";
}

function sanitizeFile(s) {
  return (s || "track")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "track";
}

export async function POST(_req, ctx) {
  const { taskId } = await ctx.params;
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const gen = task.sunoGeneration;
  if (gen?.status !== "complete" || !Array.isArray(gen.clips) || !gen.clips.length) {
    return NextResponse.json(
      { error: "No completed clips to export" },
      { status: 400 },
    );
  }

  const channel = await getChannel(task.channelId);
  const folderName = `${sanitizeFolder(channel?.name)}-${task.day}`;
  const outDir = path.join(process.cwd(), folderName);
  await fs.mkdir(outDir, { recursive: true });

  const exported = [];
  const errors = [];
  for (const clip of gen.clips) {
    const src = audioPathFor(task.channelId, taskId, clip.idx, clip.ext);
    const baseName = clip.filename
      ? path.parse(clip.filename).name
      : `track-${clip.idx + 1}`;
    const destName = `${sanitizeFile(baseName)}.${clip.ext}`;
    const dest = path.join(outDir, destName);
    try {
      await fs.copyFile(src, dest);
      exported.push({ idx: clip.idx, file: dest });
    } catch (e) {
      errors.push({ idx: clip.idx, error: String(e.message || e) });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    folder: outDir,
    folderName,
    exported: exported.length,
    errors,
  });
}
