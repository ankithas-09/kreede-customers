// app/api/book/free/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";
import Membership from "@/models/Membership";
import SlotHold from "@/models/SlotHold";

type Selection = { courtId: number; start: string; end: string };

export async function POST(req: NextRequest) {
  await dbConnect();

  const { user, date, selections, clientId } = (await req.json()) as {
    user: { id: string; name?: string; email: string };
    date: string;            // "YYYY-MM-DD"
    selections: Selection[]; // [{ courtId, start, end }, ...]
    clientId?: string;       // holder/browser id from localStorage
  };

  if (!user?.id || !user?.email || !date || !Array.isArray(selections) || selections.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing user/date/selections" }, { status: 400 });
  }

  // 1) Get latest PAID membership for this user
  const mem = await Membership.findOne({ userId: String(user.id), status: "PAID" })
    .sort({ createdAt: -1 })
    .lean();

  if (!mem) {
    return NextResponse.json({ ok: false, error: "No active membership found." }, { status: 403 });
  }

  const gamesTotal = mem.games || 0;
  const gamesUsed = mem.gamesUsed || 0;
  const remaining = Math.max(0, gamesTotal - (gamesUsed || 0));

  if (remaining < selections.length) {
    return NextResponse.json(
      { ok: false, error: `You have only ${remaining} membership game(s) left.` },
      { status: 400 }
    );
  }

  // 2) Check slot conflicts for that date (booked = status PAID)
  const existing = await Booking.aggregate<{ key: string }>([
    { $match: { date, status: "PAID" } },
    { $unwind: "$slots" },
    {
      $project: {
        _id: 0,
        key: {
          $concat: [{ $toString: "$slots.courtId" }, "|", "$slots.start"],
        },
      },
    },
  ]);

  const bookedSet = new Set<string>(existing.map((x) => x.key));
  for (const s of selections) {
    if (bookedSet.has(`${s.courtId}|${s.start}`)) {
      return NextResponse.json(
        { ok: false, error: `Slot Court ${s.courtId} • ${s.start}-${s.end} is already booked.` },
        { status: 409 }
      );
    }
  }

  // 2b) Guard against foreign holds: if a slot is currently on hold by SOMEONE ELSE, block.
  if (clientId) {
    const holds = await SlotHold.find({
      date,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    }).lean();

    const conflictHold = holds.find((h) => h.clientId !== clientId);
    if (conflictHold) {
      return NextResponse.json(
        {
          ok: false,
          error: `Slot Court ${conflictHold.courtId} • ${
            selections.find(x => x.courtId === conflictHold.courtId && x.start === conflictHold.start)?.start
          }-${
            selections.find(x => x.courtId === conflictHold.courtId && x.start === conflictHold.start)?.end
          } is currently on hold by another user.`,
        },
        { status: 409 }
      );
    }
  }

  // 3) Transaction: create free booking + increment membership usage
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderId = `memfree_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create zero-amount booking
    await Booking.create(
      [
        {
          orderId,
          userId: String(user.id),
          userName: user.name || "",
          userEmail: user.email,
          date,
          slots: selections.map((s) => ({ courtId: s.courtId, start: s.start, end: s.end })),
          amount: 0,
          currency: "INR",
          status: "PAID",
          paymentRef: "MEMBERSHIP",
          paymentRaw: { mode: "MEMBERSHIP", at: new Date().toISOString() },
        },
      ],
      { session }
    );

    // Increment membership usage (cap at total games)
    const incBy = selections.length;
    const newUsed = Math.min((gamesUsed || 0) + incBy, gamesTotal);

    await Membership.updateOne({ _id: mem._id }, { $set: { gamesUsed: newUsed } }, { session });

    // Clear holds for these slots (regardless of holder; booking is now final)
    await SlotHold.deleteMany({
      date,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    }).session(session);

    await session.commitTransaction();
    session.endSession();

    return NextResponse.json({ ok: true, orderId });
  } catch (e: unknown) {
    await session.abortTransaction();
    session.endSession();
    console.error("Free membership booking failed:", e);
    const message = e instanceof Error ? e.message : "Booking failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
