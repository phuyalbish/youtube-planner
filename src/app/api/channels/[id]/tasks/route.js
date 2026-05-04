import { NextResponse } from "next/server";
import { createTask, getChannel, listTasks } from "@/lib/db";
import { toTaskDTO } from "@/lib/types";

export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const tasks = await listTasks(id);
  return NextResponse.json({ tasks: tasks.map(toTaskDTO) });
}

export async function POST(req, ctx) {
  const { id } = await ctx.params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const task = await createTask(id, {
    day: Number(body.day) || 1,
    title: body.title ?? "",
    sunoPrompt: body.sunoPrompt ?? "",
    thumbnailText: body.thumbnailText ?? "",
  });
  return NextResponse.json({ task: toTaskDTO(task) }, { status: 201 });
}