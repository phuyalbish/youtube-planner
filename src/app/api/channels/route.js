import { NextResponse } from "next/server";
import { createChannel, listChannels, listTasks } from "@/lib/db";

export async function GET() {
  const channels = await listChannels();
  const withCounts = await Promise.all(
    channels.map(async (c) => {
      const tasks = await listTasks(c.id);
      const pending = tasks.filter((t) => !t.uploaded).length;
      return { ...c, total: tasks.length, pending };
    }),
  );
  return NextResponse.json({ channels: withCounts });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const channel = await createChannel(name);
  return NextResponse.json({ channel }, { status: 201 });
}