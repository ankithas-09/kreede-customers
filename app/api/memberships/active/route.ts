import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Membership from "@/models/Membership";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    const m = await Membership.findOne({ userId: String(userId), status: "PAID" })
      .sort({ createdAt: -1 })
      .lean();

    if (!m) return NextResponse.json({ ok: true, membership: null });

    const gamesUsed = m.gamesUsed || 0;
    const remaining = Math.max(0, (m.games || 0) - gamesUsed);
    const percentUsed = m.games > 0 ? Math.round((gamesUsed / m.games) * 100) : 0;

    return NextResponse.json({
      ok: true,
      membership: { ...m, gamesUsed, remaining, percentUsed },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
