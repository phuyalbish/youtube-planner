import { NextResponse } from "next/server";
import { deleteChannel, getChannel, updateChannel } from "@/lib/db";

export async function GET(_req, ctx) {
  const { id } = await ctx.params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ channel });
}

export async function PATCH(req, ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const channel = await updateChannel(id, {
    name: body.name,
    description: body.description,
    presets: body.presets,
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ channel });
}

export async function DELETE(_req, ctx) {
  const { id } = await ctx.params;
  await deleteChannel(id);
  return NextResponse.json({ ok: true });
}