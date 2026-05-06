import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { getSettings } from "@/lib/db";
import {
  CLIP_URL,
  DOWNLOAD_URL,
  SUNO_CDN,
  authHeaders,
  fetchLibrary,
  sanitizeFile as sanitize,
} from "@/lib/sunoLibrary";

async function downloadOne(token, clip, outDir, format) {
  const headers = authHeaders(token);
  const id = clip.id;
  const title = clip.title || "Untitled";
  const safe = sanitize(title, id);
  const filepath = path.join(outDir, `${safe}.${format}`);

  try {
    const stat = await fs.stat(filepath);
    if (stat.isFile() && stat.size > 0) {
      return { status: "skipped", file: filepath, title, id };
    }
  } catch {}

  if (format === "wav") {
    // Strict WAV: ask Suno for the WAV directly. No MP3 fallback, no conversion.
    // Suno generates WAVs on-demand: the first call queues the job and the
    // returned URL 404s for a few seconds. We retry with backoff.
    let lastErr = "";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Try fetching a candidate URL with retries (URL may be queued and 404 briefly).
    const tryFetchSave = async (url, label) => {
      const delays = [0, 1500, 3000, 5000, 7000, 9000]; // ~25s total
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await sleep(delays[i]);
        try {
          const r2 = await fetch(url, { headers });
          if (r2.ok) {
            await streamSave(r2, filepath);
            return true;
          }
          lastErr = `${label} HTTP ${r2.status}`;
          if (r2.status !== 403 && r2.status !== 404 && r2.status !== 425) break;
        } catch (e) {
          lastErr = `${label} ${e.message || e}`;
        }
      }
      return false;
    };

    // 1) The on-demand WAV download endpoint. Either returns the WAV bytes
    //    directly or a JSON pointer to the generated file on CDN. We retry the
    //    initial call too — Suno sometimes returns 202/425 while queued.
    const callDelays = [0, 2000, 4000, 6000];
    for (let i = 0; i < callDelays.length; i++) {
      if (callDelays[i]) await sleep(callDelays[i]);
      try {
        const r = await fetch(`${DOWNLOAD_URL(id)}?format=wav`, { headers });
        if (r.ok) {
          const ct = r.headers.get("content-type") || "";
          if (ct.startsWith("application/json")) {
            const j = await r.json();
            const url = j.download_url || j.url || j.wav_url || j.audio_url;
            if (url) {
              if (await tryFetchSave(url, "download_url")) {
                return { status: "ok", file: filepath, title, id, format: "wav" };
              }
            } else {
              lastErr = "no download_url in /api/download response";
            }
          } else {
            await streamSave(r, filepath);
            return { status: "ok", file: filepath, title, id, format: "wav" };
          }
          break;
        } else {
          lastErr = `/api/download HTTP ${r.status}`;
          if (r.status !== 202 && r.status !== 425 && r.status !== 409) break;
        }
      } catch (e) {
        lastErr = String(e.message || e);
        break;
      }
    }

    // 2) Clip detail endpoint sometimes exposes wav_audio_url directly.
    try {
      const r = await fetch(CLIP_URL(id), { headers });
      if (r.ok) {
        const j = await r.json();
        const url = j.wav_audio_url || j.download_url;
        if (url && (await tryFetchSave(url, "clip wav_audio_url"))) {
          return { status: "ok", file: filepath, title, id, format: "wav" };
        }
      }
    } catch {}

    // 3) Direct CDN .wav (works for some accounts/clips), with retries.
    if (await tryFetchSave(`${SUNO_CDN}/${id}.wav`, "cdn .wav")) {
      return { status: "ok", file: filepath, title, id, format: "wav" };
    }

    throw new Error(`WAV unavailable for this clip (${lastErr || "unknown"})`);
  }

  // format === "mp3" — fetch the public MP3 from CDN, save verbatim.
  const mp3Url = clip.audio_url || `${SUNO_CDN}/${id}.mp3`;
  const r = await fetch(mp3Url, { headers });
  if (!r.ok) throw new Error(`MP3 HTTP ${r.status}`);
  await streamSave(r, filepath);
  return { status: "ok", file: filepath, title, id, format: "mp3" };
}

async function streamSave(res, filepath) {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filepath, buf);
    return;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(filepath));
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const filter = String(body.filter || "")
    .replace(/[*?]/g, "")
    .trim()
    .toLowerCase();
  const limitIn = Number(body.limit);
  const limit =
    Number.isFinite(limitIn) && limitIn > 0 ? Math.floor(limitIn) : Infinity;
  const idSet =
    Array.isArray(body.ids) && body.ids.length
      ? new Set(body.ids.map(String))
      : null;
  const settings = await getSettings();
  const token = settings.suno?.libraryToken;
  const settingsFormat = settings.suno?.libraryDownloadFormat;
  const formatIn = String(body.format || settingsFormat || "").toLowerCase();
  const format = formatIn === "mp3" ? "mp3" : "wav";
  if (!token) {
    return new Response(
      JSON.stringify({ error: "No Suno library token saved. Set it in Settings." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const outDir = path.join(process.cwd(), "..", "SunoMusic");

  await fs.mkdir(outDir, { recursive: true });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        send({ type: "start", format, outDir });

        let clips = await fetchLibrary(token, send, { filter, limit });
        if (idSet) clips = clips.filter((c) => idSet.has(String(c.id)));
        send({
          type: "library",
          count: clips.length,
          filter,
          limit: Number.isFinite(limit) ? limit : null,
        });
        if (!clips.length) {
          send({ type: "done", total: 0, downloaded: 0, failed: 0, skipped: 0 });
          controller.close();
          return;
        }

        let downloaded = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          const title = clip.title || "Untitled";
          send({ type: "progress", index: i + 1, total: clips.length, title, id: clip.id });
          try {
            const r = await downloadOne(token, clip, outDir, format);
            let bytes = 0;
            if (r.file) {
              try { bytes = (await fs.stat(r.file)).size; } catch {}
            }
            if (r.status === "skipped") {
              skipped++;
              send({ type: "item", status: "skipped", title, id: clip.id, bytes });
            } else {
              downloaded++;
              send({
                type: "item",
                status: "ok",
                title,
                id: clip.id,
                file: r.file,
                format: r.format,
                fallback: !!r.fallback,
                bytes,
              });
            }
          } catch (e) {
            failed++;
            send({ type: "item", status: "failed", title, id: clip.id, error: String(e.message || e) });
          }
        }

        send({
          type: "done",
          total: clips.length,
          downloaded,
          failed,
          skipped,
          outDir,
        });
        controller.close();
      } catch (e) {
        const enc2 = new TextEncoder();
        controller.enqueue(
          enc2.encode(JSON.stringify({ type: "error", error: String(e.message || e) }) + "\n"),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
