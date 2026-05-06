// Polls suno.com's internal feed to learn whether queued generations are done.
// The browser fires the actual generate request (see SunoGenerationPanel) and
// records clip IDs via /api/suno/runs; this helper resolves those IDs into
// audio URLs once Suno finishes rendering.
//
// Generation IDs are stored comma-joined per run, so one fetch resolves a
// whole run at once.

const FEED_V2 = "https://studio-api-prod.suno.com/api/feed/v2";

export async function fetchGenerationStatus(settings, generationId) {
  if (!settings?.libraryToken) {
    throw new Error("No Suno library token saved.");
  }
  const url = `${FEED_V2}?ids=${encodeURIComponent(generationId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${settings.libraryToken}`,
      Accept: "application/json",
      Origin: "https://suno.com",
      Referer: "https://suno.com/",
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Suno status ${res.status}: ${data.detail || data.error || data.message || text.slice(0, 200) || "unknown"}`,
    );
  }

  // /api/feed/v2 typically returns either an array or { clips: [...] }.
  const arr = Array.isArray(data) ? data : data?.clips ?? [];
  const clips = arr.map((c) => ({
    id: c.id,
    audio_url: c.audio_url,
    image_url: c.image_url,
    title: c.title,
    duration: c.metadata?.duration ?? c.duration,
    status: c.status,
  }));
  if (clips.length === 0) return { status: "processing", clips };
  if (clips.some((c) => c.status === "error")) return { status: "failed", clips };
  const allComplete = clips.every((c) => c.status === "complete" && c.audio_url);
  return { status: allComplete ? "complete" : "processing", clips };
}
