import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { fetchLibrary } from "@/lib/sunoLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the matched clips' metadata only — no audio downloads. Used to
// preview which tracks would be downloaded before actually pulling them.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const filter = String(body.filter || "")
    .replace(/[*?]/g, "")
    .trim()
    .toLowerCase();
  const limitIn = Number(body.limit);
  const limit =
    Number.isFinite(limitIn) && limitIn > 0 ? Math.floor(limitIn) : Infinity;

  const settings = await getSettings();
  const token = settings.suno?.libraryToken;
  if (!token) {
    return NextResponse.json(
      { error: "No Suno library token saved." },
      { status: 400 },
    );
  }

  let scanned = 0;
  let pages = 0;
  try {
    const clips = await fetchLibrary(
      token,
      (evt) => {
        if (evt?.type === "feed") {
          scanned = evt.scanned ?? scanned;
          pages++;
        }
      },
      { filter, limit },
    );
    return NextResponse.json({
      ok: true,
      scanned,
      pages,
      filter,
      limit: Number.isFinite(limit) ? limit : null,
      clips: clips.map((c) => ({
        id: c.id,
        title: c.title || "Untitled",
        duration: c.metadata?.duration ?? c.duration ?? null,
        created_at: c.created_at ?? c.createdAt ?? null,
        image_url: c.image_url ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e.message || e) },
      { status: 502 },
    );
  }
}
