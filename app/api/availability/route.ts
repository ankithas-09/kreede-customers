import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";
import SlotHold from "@/models/SlotHold";

export type CourtSlot = {
  courtId: number;
  start: string;
  end: string;
  status: "available" | "booked" | "held" | "heldByMe";
};

const OPEN = 6;   // 06:00
const CLOSE = 23; // 23:00 (last slot 22:00–23:00)

function buildDay() {
  const slots: { start: string; end: string }[] = [];
  for (let h = OPEN; h < CLOSE; h++) {
    const s = String(h).padStart(2, "0") + ":00";
    const e = String(h + 1).padStart(2, "0") + ":00";
    slots.push({ start: s, end: e });
  }
  return slots;
}

export async function GET(req: NextRequest) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const clientId = searchParams.get("clientId") || ""; // NEW

  // Build base day structure: 3 courts × hourly slots
  const base = buildDay();
  const courts: CourtSlot[][] = [1, 2, 3].map((cid) =>
    base.map(({ start, end }) => ({
      courtId: cid,
      start,
      end,
      status: "available" as const,
    }))
  );

  // Mark booked (PAID)
  const booked = await Booking.find({ date, status: "PAID" }, { slots: 1 }).lean();
  for (const b of booked) {
    for (const s of b.slots || []) {
      const arr = courts[s.courtId - 1];
      const idx = arr.findIndex((x) => x.start === s.start);
      if (idx >= 0) arr[idx].status = "booked";
    }
  }

  // Mark holds (skip over already-booked)
  const holds = await SlotHold.find({ date }).lean();
  for (const h of holds) {
    const arr = courts[h.courtId - 1];
    const idx = arr.findIndex((x) => x.start === h.start);
    if (idx >= 0 && arr[idx].status === "available") {
      arr[idx].status = h.clientId && clientId && h.clientId === clientId ? "heldByMe" : "held";
    }
  }

  return NextResponse.json({ date, courts });
}
