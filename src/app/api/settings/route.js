import { NextResponse } from "next/server";
import path from "node:path";
import { getSettings, updateSettings } from "@/lib/db";
import { hasFfmpeg } from "@/lib/audio";

export const runtime = "nodejs";

function redact(settings) {
  const s = JSON.parse(JSON.stringify(settings));
  s.suno = s.suno || {};
  s.suno.libraryTokenSet = !!s.suno.libraryToken;
  delete s.suno.libraryToken;
  return s;
}

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({ settings: redact(s) });
}

export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  const cur = await getSettings();
  const incoming = body.suno ?? {};
  const merged = {
    suno: {
      ...cur.suno,
      ...incoming,
      libraryToken:
        typeof incoming.libraryToken === "string"
          ? incoming.libraryToken
          : cur.suno.libraryToken,
    },
  };
  const saved = await updateSettings(merged);
  return NextResponse.json({ settings: redact(saved) });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "info") {
    const ffmpeg = await hasFfmpeg();
    return NextResponse.json({
      ffmpeg,
      ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
      audioDir: path.join(process.cwd(), "public", "audio"),
      dataFile: path.join(process.cwd(), "data", "db.json"),
      node: process.version,
      platform: process.platform,
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
