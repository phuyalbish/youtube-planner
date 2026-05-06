import { NextResponse } from "next/server";
import { getTask, mutateSunoGeneration } from "@/lib/db";
import { removeTaskAudio } from "@/lib/audio";

export const runtime = "nodejs";

// Accepts the result of one or more browser-side calls to suno.com's
// /api/generate/v2/. The body is { runs: [{ clipIds: ["uuid", ...], error: ... }, ...] }
// (one entry per "Generations" in the UI). We persist a sunoGeneration record
// matching the shape used by the existing polling flow, so /api/suno/status
// can pick it up unchanged.
export async function POST(req, ctx) {
  const { taskId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body.runs) ? body.runs : [];
  if (!incoming.length) {
    return NextResponse.json({ error: "runs[] required" }, { status: 400 });
  }

  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await removeTaskAudio(task.channelId, taskId).catch(() => {});

  const now = Date.now();
  const runs = incoming.map((r, i) => {
    const ids = Array.isArray(r.clipIds) ? r.clipIds.filter(Boolean) : [];
    const error = r.error ? String(r.error) : null;
    return {
      id: `r${now}_${i}`,
      generationId: ids.length ? ids.join(",") : null,
      status: ids.length ? "pending" : "error",
      error,
      startedAt: now,
    };
  });

  const allFailed = runs.every((r) => r.status === "error");
  const sunoGeneration = {
    status: allFailed ? "error" : "generating",
    count: runs.length,
    runs,
    clips: [],
    startedAt: now,
    error: allFailed ? runs.find((r) => r.error)?.error || "All runs failed" : null,
  };

  await mutateSunoGeneration(taskId, () => sunoGeneration);
  return NextResponse.json({ ok: !allFailed, sunoGeneration });
}
