import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { Order } from "@/models/Order";

const PRICE_PER_SLOT = 500;

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

  // Normalize docs & total
  const slotDocs = selections.map((s) => ({
    courtId: s.courtId,
    date,
    startTime: s.startTime,
    endTime: s.endTime,
    name,
    email,
    phone,
    price: PRICE_PER_SLOT,
    status: "confirmed" as const,
  }));
  const amountPaid = slotDocs.length * PRICE_PER_SLOT;

  const session = await mongoose.startSession();
  let insertedDocs: InsertedDoc[] = [];

  try {
    await session.withTransaction(async () => {
      // 1) Insert per-slot bookings (unique index prevents double-book)
      //    ordered:true means it will stop on first duplicate error (which is OK here)
      const inserted = await Booking.insertMany(slotDocs, {
        session,
        ordered: true,
      });

      // Keep only the fields we need outside the transaction (without using `any`)
      insertedDocs = inserted.map((d) => {
        const doc = d as unknown as InsertedDoc;
        return {
          courtId: doc.courtId,
          date: doc.date,
          startTime: doc.startTime,
          endTime: doc.endTime,
        };
      });

      // 2) Insert a single Order with user + slots + total
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

    // If we get here, the transaction was committed
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
    // If the error came from a unique index violation, surface a friendly message
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
    // Always end the session; DO NOT abort after a successful commit
    await session.endSession();
  }
}
