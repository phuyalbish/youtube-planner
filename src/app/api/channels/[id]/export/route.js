import { NextResponse } from "next/server";
import { getChannel, listTasks } from "@/lib/db";

export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const tasks = await listTasks(id);

  const out = {
    channel: channel.name,
    description: channel.description ?? "",
    tasks: tasks.map((t) => ({
      day: t.day,
      title: t.title,
      "suno-prompt": t.sunoPrompt,
      "thumbnail-text": t.thumbnailText,
      uploaded: t.uploaded,
    })),
  };

  const filename = channel.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}