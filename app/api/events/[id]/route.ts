import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Event from "@/models/Event";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await ctx.params;
  const ev = await Event.findById(id).lean().catch(() => null);
  if (!ev) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, event: ev });
}
