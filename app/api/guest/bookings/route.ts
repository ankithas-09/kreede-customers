// app/api/guest/bookings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import GuestBooking from "@/models/GuestBooking";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const id = searchParams.get("id");

    if (!orderId && !id) {
      return NextResponse.json(
        { ok: false, error: "orderId or id is required" },
        { status: 400 }
      );
    }

    const filter = orderId ? { orderId } : { _id: id };
    const booking = await GuestBooking.findOne(filter).lean();

    if (!booking) {
      return NextResponse.json(
        { ok: false, error: "Booking not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, booking });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
