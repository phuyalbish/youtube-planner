import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { clearSunoGeneration, getTask } from "@/lib/db";
import { audioPathFor, removeTaskAudio } from "@/lib/audio";

export const runtime = "nodejs";

export async function GET(req, ctx) {
  const { taskId } = await ctx.params;
  const url = new URL(req.url);
  const idx = Math.max(0, Number(url.searchParams.get("i") ?? "0") | 0);
  const task = await getTask(taskId);
  if (!task) return new NextResponse("Not found", { status: 404 });
  const gen = task.sunoGeneration;
  const clip = gen?.clips?.find((c) => c.idx === idx);
  if (!clip) return new NextResponse("No audio", { status: 404 });
  const filePath = audioPathFor(task.channelId, taskId, clip.idx, clip.ext);
  let buf;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
  const ct = clip.ext === "wav" ? "audio/wav" : "audio/mpeg";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": ct,
      "Content-Length": String(buf.length),
      "Content-Disposition": `inline; filename="${path.basename(clip.filename || filePath)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

export async function DELETE(_req, ctx) {
  const { taskId } = await ctx.params;
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await removeTaskAudio(task.channelId, taskId).catch(() => {});
  await clearSunoGeneration(taskId);
  return NextResponse.json({ ok: true });
}
