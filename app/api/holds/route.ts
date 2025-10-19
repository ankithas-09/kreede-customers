// app/api/holds/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";
import SlotHold, { computeExpiresAt } from "@/models/SlotHold";

type Selection = { courtId: number; start: string; end?: string };

export async function POST(req: NextRequest) {
  await dbConnect();
  const { date, selections, clientId, userId } = (await req.json()) as {
    date?: string;
    selections?: Selection[];
    clientId?: string;
    userId?: string;
  };

  if (!date || !Array.isArray(selections) || selections.length === 0 || !clientId) {
    return NextResponse.json({ ok: false, error: "Missing date/selections/clientId" }, { status: 400 });
  }

  // Preload PAID-booked keys for the day to block them immediately
  const existing = await Booking.aggregate<{ key: string }>([
    { $match: { date, status: "PAID" } },
    { $unwind: "$slots" },
    {
      $project: {
        _id: 0,
        key: { $concat: [{ $toString: "$slots.courtId" }, "|", "$slots.start"] },
      },
    },
  ]);
  const bookedSet = new Set(existing.map((x) => x.key));

  const results: { courtId: number; start: string; ok: boolean; reason?: string }[] = [];

  for (const s of selections) {
    const key = `${s.courtId}|${s.start}`;

    if (bookedSet.has(key)) {
      results.push({ courtId: s.courtId, start: s.start, ok: false, reason: "BOOKED" });
      continue;
    }

    // Check existing hold
    const existingHold = await SlotHold.findOne({ date, courtId: s.courtId, start: s.start }).lean();

    if (existingHold && existingHold.clientId !== clientId) {
      // Held by someone else
      results.push({ courtId: s.courtId, start: s.start, ok: false, reason: "HELD_BY_OTHER" });
      continue;
    }

    // Create or refresh my hold (set/extend TTL)
    const expiresAt = computeExpiresAt(new Date());
    await SlotHold.updateOne(
      { date, courtId: s.courtId, start: s.start },
      {
        $set: {
          date,
          courtId: s.courtId,
          start: s.start,
          clientId,
          userId: userId || undefined,
          expiresAt,
        },
      },
      { upsert: true }
    );

    results.push({ courtId: s.courtId, start: s.start, ok: true });
  }

  return NextResponse.json({ ok: true, results });
}

export async function DELETE(req: NextRequest) {
  await dbConnect();
  const { date, clientId, selections } = (await req.json()) as {
    date?: string;
    clientId?: string;
    selections?: Selection[];
  };

  if (!date || !clientId) {
    return NextResponse.json({ ok: false, error: "Missing date/clientId" }, { status: 400 });
  }

  const filterBase = { date, clientId };

  if (Array.isArray(selections) && selections.length > 0) {
    await SlotHold.deleteMany({
      ...filterBase,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    });
  } else {
    // Delete all holds for this client on this date
    await SlotHold.deleteMany(filterBase);
  }

  return NextResponse.json({ ok: true });
}
