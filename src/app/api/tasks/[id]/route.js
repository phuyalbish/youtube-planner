import { NextResponse } from "next/server";
import { deleteTask, getTask, updateTask } from "@/lib/db";
import { toTaskDTO } from "@/lib/types";

export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  const t = await getTask(id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: toTaskDTO(t) });
}

export async function PATCH(req, ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const t = await updateTask(id, {
    day: body.day,
    title: body.title,
    sunoPrompt: body.sunoPrompt,
    thumbnailText: body.thumbnailText,
    uploaded: body.uploaded,
    downloaded: body.downloaded,
  });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: toTaskDTO(t) });
}

export async function DELETE(_req, ctx) {
  const { id } = await ctx.params;
  const removed = await deleteTask(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}