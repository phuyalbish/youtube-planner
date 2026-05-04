import { NextResponse } from "next/server";
import { bulkCreateTasks, getChannel } from "@/lib/db";
import { toTaskDTO } from "@/lib/types";

export async function POST(req, ctx) {
  const { id } = await ctx.params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  let parsed;
  if (typeof body.json === "string") {
    try {
      parsed = JSON.parse(body.json);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid JSON: " + e.message },
        { status: 400 },
      );
    }
  } else if (body.json && typeof body.json === "object") {
    parsed = body.json;
  } else {
    return NextResponse.json({ error: "Missing JSON body" }, { status: 400 });
  }

  let arr;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.tasks)) arr = parsed.tasks;
    else
      return NextResponse.json(
        { error: 'JSON must be an array of tasks (or an object with a "tasks" array).' },
        { status: 400 },
      );
  } else {
    return NextResponse.json({ error: "JSON must be an array of tasks." }, { status: 400 });
  }

  const pick = (obj, ...keys) => {
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null) return v;
    }
    return "";
  };

  // Day is intentionally omitted — bulkCreateTasks auto-assigns the next free day.
  const rows = arr.map((it) => ({
    title: String(pick(it, "title")),
    sunoPrompt: String(
      pick(it, "suno_prompt", "suno-prompt", "sunoPrompt", "suno"),
    ),
    thumbnailText: String(
      pick(it, "thumbnail_text", "thumbnail-text", "thumbnailText", "thumbnail"),
    ),
  }));

  const created = await bulkCreateTasks(id, rows, { replace: !!body.replace });

  return NextResponse.json(
    { count: created.length, tasks: created.map(toTaskDTO) },
    { status: 201 },
  );
}