import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let writeChain = Promise.resolve();
let cache = null;

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
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
            ...c,
            presets: Array.isArray(c.presets) ? c.presets : [],
          }))
        : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (e) {
    if (e.code === "ENOENT") {
      cache = { channels: [], tasks: [] };
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

export async function deleteChannel(id) {
  return mutate(async (db) => {
    const removedTasks = db.tasks.filter((t) => t.channelId === id);
    db.channels = db.channels.filter((c) => c.id !== id);
    db.tasks = db.tasks.filter((t) => t.channelId !== id);
    return { removedTasks };
  });
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

    // Pick the next free day for this channel, skipping ones already in use.
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
    return t;
  });
}

export async function deleteTask(id) {
  return mutate(async (db) => {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    db.tasks = db.tasks.filter((x) => x.id !== id);
    return t;
  });
}
