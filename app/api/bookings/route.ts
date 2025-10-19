// app/api/bookings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const email = searchParams.get("email"); // ← NEW: optional fallback

    if (!userId && !email) {
      return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
    }

    // Build filter:
    // - If both are present, match either one
    // - If only one is present, match that one
    const or: Record<string, unknown>[] = [];
    if (userId) or.push({ userId: String(userId) });
    if (email) or.push({ userEmail: String(email).trim() });

    const filter = or.length === 1 ? or[0] : { $or: or };

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ ok: true, bookings });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
