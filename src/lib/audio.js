import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { randomUUID } from "node:crypto";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

export function audioPathFor(channelId, taskId, idx, ext = "wav") {
  return path.join(AUDIO_DIR, channelId, `${taskId}-${idx}.${ext}`);
}

export function audioPublicUrl(channelId, taskId, idx, ext = "wav") {
  return `/audio/${channelId}/${taskId}-${idx}.${ext}`;
}

async function ensureDir(p) {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

let ffmpegAvailable = null;
export async function hasFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  ffmpegAvailable = await new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  return ffmpegAvailable;
}

async function fetchToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  await ensureDir(dest);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`));
    });
  });
}

// Downloads the MP3 from `audioUrl`, converts to 24-bit/48kHz WAV at the
// final destination, cleans up the temp MP3. If ffmpeg is unavailable, falls
// back to saving the MP3 directly.
// Returns { ext, bytes }.
export async function downloadAndConvert({ channelId, taskId, idx, audioUrl }) {
  const tmp = path.join(os.tmpdir(), `suno-${taskId}-${idx}-${randomUUID()}.mp3`);
  try {
    await fetchToFile(audioUrl, tmp);
    if (await hasFfmpeg()) {
      const dest = audioPathFor(channelId, taskId, idx, "wav");
      await ensureDir(dest);
      await runFfmpeg([
        "-y",
        "-i",
        tmp,
        "-acodec",
        "pcm_s24le",
        "-ar",
        "48000",
        dest,
      ]);
      const stat = await fs.stat(dest);
      return { ext: "wav", bytes: stat.size };
    }
    const dest = audioPathFor(channelId, taskId, idx, "mp3");
    await ensureDir(dest);
    await fs.copyFile(tmp, dest);
    const stat = await fs.stat(dest);
    return { ext: "mp3", bytes: stat.size };
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

export async function removeTaskAudio(channelId, taskId) {
  const dir = path.join(AUDIO_DIR, channelId);
  const entries = await fs.readdir(dir).catch(() => []);
  await Promise.all(
    entries
      .filter((f) => f.startsWith(taskId + "-") || f.startsWith(taskId + "."))
      .map((f) => fs.rm(path.join(dir, f), { force: true })),
  );
}
