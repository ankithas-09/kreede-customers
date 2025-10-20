import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { Order } from "@/models/Order";

// ---- Dynamic pricing: weekdays ₹500, weekends ₹700 ----
function isWeekend(dateStr: string) {
  // Interpret date in local time to avoid TZ surprises
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}
function getPriceForDate(dateStr: string) {
  return isWeekend(dateStr) ? 700 : 500;
}

type SelectionIn = { courtId: number; startTime: string; endTime: string };
type InsertedDoc = { courtId: number; date: string; startTime: string; endTime: string };

export async function POST(req: NextRequest) {
  await dbConnect();

  const payload = await req.json();
  const { name, email, phone, date, selections } = payload as {
    name: string;
    email: string;
    phone: string;
    date: string;
    selections: SelectionIn[];
  };

  if (!name || !email || !phone || !date || !Array.isArray(selections) || selections.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Dynamic unit price for this date
  const unitPrice = getPriceForDate(date);

  // Normalize docs & total
  const slotDocs = selections.map((s) => ({
    courtId: s.courtId,
    date,
    startTime: s.startTime,
    endTime: s.endTime,
    name,
    email,
    phone,
    price: unitPrice,               // ← per-slot price stored
    status: "confirmed" as const,
  }));
  const amountPaid = slotDocs.length * unitPrice; // ← dynamic total

  const session = await mongoose.startSession();
  let insertedDocs: InsertedDoc[] = [];

  try {
    await session.withTransaction(async () => {
      // 1) Insert per-slot bookings
      const inserted = await Booking.insertMany(slotDocs, {
        session,
        ordered: true,
      });

      // Extract only needed fields
      insertedDocs = inserted.map((d) => {
        const doc = d as unknown as InsertedDoc;
        return {
          courtId: doc.courtId,
          date: doc.date,
          startTime: doc.startTime,
          endTime: doc.endTime,
        };
      });

      // 2) Insert single Order with total
      await Order.create(
        [
          {
            name,
            email,
            phone,
            amountPaid,
            slots: slotDocs.map((d) => ({
              courtId: d.courtId,
              date: d.date,
              startTime: d.startTime,
              endTime: d.endTime,
              price: d.price,
            })),
            status: "paid",
          },
        ],
        { session }
      );
    });

    return NextResponse.json({
      success: true,
      booked: insertedDocs.map((d) => ({
        courtId: d.courtId,
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
      })),
      amountPaid,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;

    const isDup = code === 11000 || /duplicate key/i.test(message) || /E11000/i.test(message);

    return NextResponse.json(
      {
        success: false,
        error: isDup ? "Some selected slots are already booked." : "Booking failed.",
      },
      { status: isDup ? 409 : 500 }
    );
  } finally {
    await session.endSession();
  }
}
