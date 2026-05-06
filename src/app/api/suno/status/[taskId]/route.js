import { NextResponse } from "next/server";
import { getChannel, getSettings, getTask, mutateSunoGeneration } from "@/lib/db";
import { fetchGenerationStatus } from "@/lib/suno";
import { audioPublicUrl, downloadAndConvert } from "@/lib/audio";
import { toTaskDTO } from "@/lib/types";

export const runtime = "nodejs";

const inflight = new Set();

function recomputeStatus(gen) {
  if (!gen) return gen;
  const pending = gen.runs.some((r) => r.status === "pending");
  const anyOk = gen.runs.some((r) => r.status === "done") || gen.clips.length > 0;
  if (pending) return { ...gen, status: "generating" };
  if (anyOk) return { ...gen, status: "complete" };
  return {
    ...gen,
    status: "error",
    error: gen.error || gen.runs.find((r) => r.error)?.error || "Generation failed",
  };
}

async function updateRun(taskId, runId, patch) {
  await mutateSunoGeneration(taskId, (gen) => {
    if (!gen) return gen;
    return {
      ...gen,
      runs: gen.runs.map((r) => (r.id === runId ? { ...r, ...patch } : r)),
    };
  });
}

async function appendClip(taskId, clip) {
  await mutateSunoGeneration(taskId, (gen) => {
    if (!gen) return gen;
    if (gen.clips.some((c) => c.sunoClipId === clip.sunoClipId)) return gen;
    return { ...gen, clips: [...gen.clips, clip] };
  });
}

async function processRuns(taskId) {
  // Drain all runs that have completed on Suno's side. Single-flight per task
  // is enforced by the caller via `inflight`.
  while (true) {
    const task = await getTask(taskId);
    if (!task) return;
    const gen = task.sunoGeneration;
    if (!gen) return;
    const run = gen.runs.find((r) => r.status === "pending");
    if (!run) break;

    const settings = await getSettings();
    const sunoSettings = settings.suno.libraryToken
      ? { ...settings.suno, provider: "suno-direct" }
      : settings.suno;
    let result;
    try {
      result = await fetchGenerationStatus(sunoSettings, run.generationId);
    } catch (e) {
      await updateRun(taskId, run.id, { status: "error", error: e.message });
      continue;
    }
    if (result.status === "failed") {
      await updateRun(taskId, run.id, { status: "error", error: "Suno reported failure" });
      continue;
    }
    if (result.status !== "complete") {
      // Still working — exit, next poll will retry.
      return;
    }

    const ready = result.clips.filter((c) => c.audio_url);
    for (const clip of ready) {
      const cur = (await getTask(taskId))?.sunoGeneration;
      if (!cur) return;
      if (cur.clips.some((c) => c.sunoClipId === clip.id)) continue;
      const idx = cur.clips.length;
      try {
        const { ext, bytes } = await downloadAndConvert({
          channelId: task.channelId,
          taskId,
          idx,
          audioUrl: clip.audio_url,
        });
        const channel = await getChannel(task.channelId);
        const channelName = (channel?.name || "Channel")
          .replace(/["\\\r\n]/g, "")
          .trim();
        const filename = `${channelName} - Day${task.day} - ${idx + 1}.${ext}`;
        await appendClip(taskId, {
          runId: run.id,
          sunoClipId: clip.id,
          sunoUrl: clip.audio_url,
          idx,
          ext,
          bytes,
          duration: clip.duration ?? null,
          wavPath: audioPublicUrl(task.channelId, taskId, idx, ext),
          filename,
          completedAt: new Date().toISOString(),
        });
      } catch (e) {
        await updateRun(taskId, run.id, { error: e.message });
      }
    }
    await updateRun(taskId, run.id, { status: "done" });
  }
  await mutateSunoGeneration(taskId, recomputeStatus);
}

export async function GET(_req, ctx) {
  const { taskId } = await ctx.params;
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const gen = task.sunoGeneration;
  if (gen && gen.status === "generating" && !inflight.has(taskId)) {
    inflight.add(taskId);
    processRuns(taskId)
      .catch(() => {})
      .finally(() => inflight.delete(taskId));
  }
  // Always return the current snapshot — background work updates it for the
  // next poll.
  const current = await getTask(taskId);
  return NextResponse.json({ task: toTaskDTO(current) });
}
