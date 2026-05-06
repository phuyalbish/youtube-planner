import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultSettings } from "./types.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

let writeChain = Promise.resolve();
let cache = null;

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function mergeSettings(loaded) {
  const def = defaultSettings();
  const out = { ...def };
  if (loaded && typeof loaded === "object") {
    for (const k of Object.keys(def)) {
      out[k] = { ...def[k], ...(loaded[k] ?? {}) };
    }
  }
  return out;
}

async function readDb() {
  if (cache) return cache;
  await ensureDirs();
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    cache = {
      channels: Array.isArray(parsed.channels)
        ? parsed.channels.map((c) => ({
            description: "",
            presets: [],
            sunoStyle: "",
            sunoExcludeStyle: "",
            sunoWeirdness: 30,
            sunoStyleInfluence: 70,
            ...c,
            presets: Array.isArray(c.presets) ? c.presets : [],
            sunoStyle: typeof c.sunoStyle === "string" ? c.sunoStyle : "",
            sunoExcludeStyle:
              typeof c.sunoExcludeStyle === "string" ? c.sunoExcludeStyle : "",
            sunoWeirdness:
              typeof c.sunoWeirdness === "number" ? c.sunoWeirdness : 30,
            sunoStyleInfluence:
              typeof c.sunoStyleInfluence === "number" ? c.sunoStyleInfluence : 70,
          }))
        : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      settings: mergeSettings(parsed.settings),
    };
  } catch (e) {
    if (e.code === "ENOENT") {
      cache = { channels: [], tasks: [], settings: defaultSettings() };
    } else {
      throw e;
    }
  }
  return cache;
}

async function writeDb(data) {
  await ensureDirs();
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
  cache = data;
}

async function mutate(fn) {
  const next = writeChain.then(async () => {
    const db = await readDb();
    const draft = {
      channels: db.channels.map((c) => ({ ...c })),
      tasks: db.tasks.map((t) => ({ ...t })),
      settings: JSON.parse(JSON.stringify(db.settings ?? defaultSettings())),
    };
    const result = await fn(draft);
    await writeDb(draft);
    return result;
  });
  writeChain = next.catch(() => {});
  return next;
}

export const newId = () => randomUUID();

export async function listChannels() {
  const db = await readDb();
  return [...db.channels].sort((a, b) => a.createdAt - b.createdAt);
}

export async function getChannel(id) {
  const db = await readDb();
  return db.channels.find((c) => c.id === id) ?? null;
}

export async function createChannel(name, description = "") {
  return mutate(async (db) => {
    const channel = {
      id: newId(),
      name: name.trim() || "Untitled Channel",
      description: typeof description === "string" ? description : "",
      presets: [],
      sunoStyle: "",
      sunoExcludeStyle: "",
      sunoWeirdness: 30,
      sunoStyleInfluence: 70,
      createdAt: Date.now(),
    };
    db.channels.push(channel);
    return channel;
  });
}

export async function updateChannel(id, patch) {
  return mutate(async (db) => {
    const c = db.channels.find((ch) => ch.id === id);
    if (!c) return null;
    if (typeof patch.name === "string") c.name = patch.name.trim() || c.name;
    if (typeof patch.description === "string") c.description = patch.description;
    if (typeof patch.sunoStyle === "string") c.sunoStyle = patch.sunoStyle;
    if (typeof patch.sunoExcludeStyle === "string")
      c.sunoExcludeStyle = patch.sunoExcludeStyle;
    if (patch.sunoWeirdness !== undefined) {
      const n = Number(patch.sunoWeirdness);
      if (Number.isFinite(n)) c.sunoWeirdness = Math.max(0, Math.min(100, Math.round(n)));
    }
    if (patch.sunoStyleInfluence !== undefined) {
      const n = Number(patch.sunoStyleInfluence);
      if (Number.isFinite(n)) c.sunoStyleInfluence = Math.max(0, Math.min(100, Math.round(n)));
    }
    if (Array.isArray(patch.presets)) {
      c.presets = patch.presets
        .filter((p) => p && typeof p === "object")
        .map((p) => ({
          id: typeof p.id === "string" && p.id ? p.id : newId(),
          label: String(p.label ?? "").slice(0, 100),
          content: String(p.content ?? ""),
        }));
    }
    return c;
  });
}

async function rmChannelAudio(channelId) {
  try {
    await fs.rm(path.join(AUDIO_DIR, channelId), { recursive: true, force: true });
  } catch {}
}

async function rmTaskAudio(channelId, taskId) {
  try {
    const dir = path.join(AUDIO_DIR, channelId);
    const entries = await fs.readdir(dir).catch(() => []);
    await Promise.all(
      entries
        .filter((f) => f.startsWith(taskId + "-") || f.startsWith(taskId + "."))
        .map((f) => fs.rm(path.join(dir, f), { force: true })),
    );
  } catch {}
}

export async function deleteChannel(id) {
  const result = await mutate(async (db) => {
    const removedTasks = db.tasks.filter((t) => t.channelId === id);
    db.channels = db.channels.filter((c) => c.id !== id);
    db.tasks = db.tasks.filter((t) => t.channelId !== id);
    return { removedTasks };
  });
  await rmChannelAudio(id);
  return result;
}

export async function listTasks(channelId) {
  const db = await readDb();
  return db.tasks
    .filter((t) => t.channelId === channelId)
    .sort((a, b) => a.day - b.day || a.createdAt - b.createdAt);
}

export async function getTask(id) {
  const db = await readDb();
  return db.tasks.find((t) => t.id === id) ?? null;
}

export async function createTask(channelId, data) {
  return mutate(async (db) => {
    const channel = db.channels.find((c) => c.id === channelId);
    if (!channel) throw new Error("Channel not found");
    const task = {
      id: newId(),
      channelId,
      day: Number(data.day) || 1,
      title: data.title ?? "",
      sunoPrompt: data.sunoPrompt ?? "",
      thumbnailText: data.thumbnailText ?? "",
      uploaded: false,
      uploadedAt: null,
      createdAt: Date.now(),
    };
    db.tasks.push(task);
    return task;
  });
}

export async function bulkCreateTasks(channelId, rows, opts = {}) {
  return mutate(async (db) => {
    const channel = db.channels.find((c) => c.id === channelId);
    if (!channel) throw new Error("Channel not found");
    if (opts.replace) db.tasks = db.tasks.filter((t) => t.channelId !== channelId);

    const used = new Set(
      db.tasks.filter((t) => t.channelId === channelId).map((t) => t.day),
    );
    let cursor = 1;
    const nextDay = () => {
      while (used.has(cursor)) cursor++;
      const d = cursor;
      used.add(d);
      cursor++;
      return d;
    };

    const now = Date.now();
    const created = rows.map((r, i) => {
      const requested = Number(r.day);
      const day = requested > 0 ? requested : nextDay();
      if (requested > 0) used.add(day);
      return {
        id: newId(),
        channelId,
        day,
        title: r.title ?? "",
        sunoPrompt: r.sunoPrompt ?? "",
        thumbnailText: r.thumbnailText ?? "",
        uploaded: false,
        uploadedAt: null,
        createdAt: now + i,
      };
    });
    db.tasks.push(...created);
    return created;
  });
}

export async function updateTask(id, patch) {
  return mutate(async (db) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    if (patch.day !== undefined) t.day = Number(patch.day) || t.day;
    if (patch.title !== undefined) t.title = patch.title;
    if (patch.sunoPrompt !== undefined) t.sunoPrompt = patch.sunoPrompt;
    if (patch.thumbnailText !== undefined) t.thumbnailText = patch.thumbnailText;
    if (patch.uploaded !== undefined) {
      t.uploaded = patch.uploaded;
      t.uploadedAt = patch.uploaded ? Date.now() : null;
    }
    if (patch.downloaded !== undefined) {
      t.downloaded = !!patch.downloaded;
      t.downloadedAt = patch.downloaded ? Date.now() : null;
      // Moving back to Suno also clears the uploaded flag.
      if (!patch.downloaded) {
        t.uploaded = false;
        t.uploadedAt = null;
      }
    }
    if (patch.sunoGeneration !== undefined) {
      t.sunoGeneration = patch.sunoGeneration;
    }
    return t;
  });
}

export async function mutateSunoGeneration(id, fn) {
  return mutate(async (db) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    t.sunoGeneration = fn(t.sunoGeneration ?? null);
    return t;
  });
}

export async function patchSunoGeneration(id, patch) {
  return mutate(async (db) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    const cur = t.sunoGeneration ?? {};
    t.sunoGeneration = { ...cur, ...patch };
    return t;
  });
}

export async function clearSunoGeneration(id) {
  return mutate(async (db) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    t.sunoGeneration = null;
    return t;
  });
}

export async function deleteTask(id) {
  const removed = await mutate(async (db) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    db.tasks = db.tasks.filter((x) => x.id !== id);
    return t;
  });
  if (removed) await rmTaskAudio(removed.channelId, removed.id);
  return removed;
}

export async function getSettings() {
  const db = await readDb();
  return db.settings ?? defaultSettings();
}

export async function updateSettings(patch) {
  return mutate(async (db) => {
    db.settings = mergeSettings({ ...db.settings, ...patch });
    return db.settings;
  });
}