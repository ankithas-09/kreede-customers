// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const u = await User.findById(id)
    .select({ userId: 1, name: 1, email: 1, phone: 1, dob: 1, createdAt: 1 })
    .lean();

  if (!u) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: u });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const body: unknown = await req.json().catch(() => ({} as unknown));
  const phone: string = String((body as { phone?: unknown })?.phone ?? "").trim();

  // Basic validation: allow digits, spaces, +, -, parentheses
  const sanitized = phone.replace(/[^\d+\-\s()]/g, "");
  if (!sanitized) {
    return NextResponse.json({ ok: false, error: "Invalid phone number." }, { status: 400 });
  }
  if (sanitized.length < 7 || sanitized.length > 20) {
    return NextResponse.json({ ok: false, error: "Phone length looks invalid." }, { status: 400 });
  }

  const updated = await User.findByIdAndUpdate(
    id,
    { $set: { phone: sanitized } },
    { new: true, runValidators: true }
  )
    .select({ userId: 1, name: 1, email: 1, phone: 1, dob: 1, createdAt: 1 })
    .lean();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: updated });
}
