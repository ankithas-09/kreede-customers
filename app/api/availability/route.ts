// app/api/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/app/models/Booking";

/** Build hours like 06:00–23:00 (last start 22:00) */
function buildHours(): Array<{ start: string; end: string }> {
  const hours: Array<{ start: string; end: string }> = [];
  for (let h = 6; h <= 22; h++) {
    const s = h.toString().padStart(2, "0") + ":00";
    const e = (h + 1).toString().padStart(2, "0") + ":00";
    hours.push({ start: s, end: e });
  }
  return hours;
}

/** Convert now → Asia/Kolkata date object */
function nowInIST() {
  const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(istString);
}

/** Compare HH:mm (slot start) against IST current time if the date is today */
function isPastSlot(date: string, slotStart: string): boolean {
  const now = nowInIST();

  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  const today = `${y}-${m}-${d}`;

  if (date !== today) return false;

  const [sh, sm] = slotStart.split(":").map(Number);
  const slot = new Date(
    `${today}T${sh.toString().padStart(2, "0")}:${sm.toString().padStart(2, "0")}:00+05:30`
  );

  return now >= slot;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    // 1) Pull booked slots from new Booking schema (status=PAID)
    const bookings = await Booking.find(
      { date, status: "PAID" },
      { slots: 1, _id: 0 }
    ).lean();

    // 2) Flatten to a Set "courtId|start"
    const bookedSet = new Set<string>();
    for (const b of bookings) {
      for (const s of b.slots || []) {
        bookedSet.add(`${s.courtId}|${s.start}`);
      }
    }

    // 3) Build grid for 3 courts x hourly slots
    const hours = buildHours();
    const courts: Array<
      Array<{
        courtId: number;
        start: string;
        end: string;
        status: "available" | "booked" | "disabled";
      }>
    > = [];

    for (let courtId = 1; courtId <= 3; courtId++) {
      const slots = hours.map(({ start, end }) => {
        let status: "available" | "booked" | "disabled" = "available";

        // disable past within same day
        if (isPastSlot(date, start)) status = "disabled";

        // mark booked
        if (bookedSet.has(`${courtId}|${start}`)) status = "booked";

        return { courtId, start, end, status };
      });

      courts.push(slots);
    }

    return NextResponse.json({ date, courts });
  } catch (e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
