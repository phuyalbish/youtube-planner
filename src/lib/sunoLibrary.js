// Shared helpers for talking to suno.com's internal library feed.
//
// Cursor-based pagination over POST /api/feed/v3:
//   request  { cursor?, filters }
//   response { clips: [...], next_cursor, has_more }

export const SUNO_BASE = "https://studio-api-prod.suno.com";
export const SUNO_CDN = "https://cdn1.suno.ai";
export const FEED_URL = `${SUNO_BASE}/api/feed/v3`;
export const CLIP_URL = (id) => `${SUNO_BASE}/api/clip/${id}`;
export const DOWNLOAD_URL = (id) => `${SUNO_BASE}/api/download/clip/${id}`;

export const BASE_FILTERS = {
  disliked: "False",
  trashed: "False",
  fromStudioProject: { presence: "False" },
};

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "application/json",
    "Content-Type": "application/json",
    Referer: "https://suno.com/",
    Origin: "https://suno.com",
  };
}

export function extractClips(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["clips", "data", "songs", "results", "page_clips", "items", "feed"]) {
      if (Array.isArray(data[key]) && data[key].length) return data[key];
    }
    if (data.id && (data.audio_url || data.title)) return [data];
  }
  return [];
}

export function sanitizeFile(name, id) {
  if (!name || !name.trim()) name = "Untitled";
  name = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${name} [${(id || "unknown").slice(0, 8)}]`;
}

// Walk the cursor-paginated feed, applying a substring title filter and
// stopping as soon as `limit` matches are collected (or the API runs out).
export async function fetchLibrary(token, emit, { filter = "", limit = Infinity } = {}) {
  const headers = authHeaders(token);
  const seen = new Set();
  const matched = [];
  let scanned = 0;
  let cursor = null;
  let hasMore = true;
  const lc = filter ? filter.toLowerCase() : "";
  const send = typeof emit === "function" ? emit : () => {};

  while (hasMore && matched.length < limit) {
    const body = cursor
      ? { cursor, filters: BASE_FILTERS }
      : { filters: BASE_FILTERS };
    let res;
    try {
      res = await fetch(FEED_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`Network error: ${e.message || e}`);
    }
    if (!res.ok) {
      if (res.status === 401) throw new Error("Token invalid or expired (401).");
      if (res.status === 403) throw new Error("Token forbidden (403).");
      throw new Error(`feed/v3 returned ${res.status}`);
    }
    const data = await res.json();
    const clips = extractClips(data);
    for (const c of clips) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      scanned++;
      if (!lc || (c.title || "").toLowerCase().includes(lc)) {
        matched.push(c);
        if (matched.length >= limit) break;
      }
    }
    hasMore = !!(data?.has_more ?? data?.hasMore);
    cursor = data?.next_cursor ?? data?.nextCursor ?? null;
    send({ type: "feed", scanned, matched: matched.length, hasMore });
    if (!cursor) hasMore = false;
    if (clips.length === 0) hasMore = false;
  }
  return matched;
}
