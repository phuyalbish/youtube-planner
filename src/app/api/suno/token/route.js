import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({ token: s.suno?.libraryToken || "" });
}
