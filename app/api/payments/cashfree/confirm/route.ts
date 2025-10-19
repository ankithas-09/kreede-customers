// app/api/payments/cashfree/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";
import Membership from "@/models/Membership";
import SlotHold from "@/models/SlotHold";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

type Payment = { payment_status?: string; status?: string; [k: string]: unknown };
type UserIn = { id?: string; email?: string; name?: string };
type Selection = { courtId: number; start: string; end: string };
type HoldLean = { courtId: number; start: string; clientId?: string };

async function getOrderPayments(orderId: string): Promise<Payment[]> {
  const res = await fetch(`${BASE}/orders/${orderId}/payments`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID || "",
      "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
    },
    cache: "no-store",
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : undefined;
    throw new Error(msg || "Failed to fetch Cashfree payments");
  }
  return Array.isArray(data) ? (data as Payment[]) : [];
}

export async function POST(req: NextRequest) {
  await dbConnect();

  const { orderId, user, date, selections, amount, clientId } = (await req.json()) as {
    orderId?: string;
    user?: UserIn;
    date?: string;
    selections?: Selection[];
    amount?: number;
    clientId?: string;
  };

  // ---- Basic validation ----
  if (!orderId || !user?.id || !user?.email || !date || !Array.isArray(selections) || typeof amount !== "number") {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  // ---- 1) Verify payment status with Cashfree ----
  const payments = await getOrderPayments(orderId);
  const paid = payments.some((p) => (p.payment_status || p.status) === "SUCCESS");
  if (!paid) {
    // Return the payments array so you can see exactly what CF returned
    return NextResponse.json(
      { ok: false, error: "Payment not successful yet.", debug: { payments } },
      { status: 400 }
    );
  }

  // ---- 2) Block if any requested slot is already PAID-booked ----
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
  const conflictBooked = selections.find((s) => bookedSet.has(`${s.courtId}|${s.start}`));
  if (conflictBooked) {
    return NextResponse.json(
      {
        ok: false,
        error: `Slot Court ${conflictBooked.courtId} • ${conflictBooked.start}-${conflictBooked.end} is already booked.`,
      },
      { status: 409 }
    );
  }

  // ---- 3) Guard: slot held by a different client? (only enforced if clientId provided) ----
  if (clientId) {
    const holds = await SlotHold.find<HoldLean>({
      date,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    }).lean();

    const foreignHold = holds.find((h) => h.clientId !== clientId);
    if (foreignHold) {
      const matchSel = selections.find(
        (x) => x.courtId === foreignHold.courtId && x.start === foreignHold.start
      );
      const endForMsg = matchSel?.end ?? "";
      return NextResponse.json(
        {
          ok: false,
          error: `Slot Court ${foreignHold.courtId} • ${foreignHold.start}${endForMsg ? `-${endForMsg}` : ""} is on hold by another user.`,
        },
        { status: 409 }
      );
    }
  }

  // ---- 4) Upsert booking (idempotent on orderId) ----
  const updateDoc = {
    orderId,
    userId: String(user.id),
    userName: user.name || "",
    userEmail: user.email,
    date,
    slots: selections.map((s) => ({ courtId: s.courtId, start: s.start, end: s.end })),
    amount,
    currency: "INR" as const,
    status: "PAID" as const,
    paymentRaw: payments,
  };

  try {
    // Use findOneAndUpdate with upsert for idempotency across replays
    await Booking.findOneAndUpdate(
      { orderId },
      updateDoc,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, strict: true }
    );

    // **Verify** it actually exists now
    const saved = await Booking.findOne({ orderId }).lean();
    if (!saved?._id) {
      return NextResponse.json(
        { ok: false, error: "Booking write failed (not found after upsert).", debug: { orderId } },
        { status: 500 }
      );
    }

    // ---- 5) Clear holds for these slots (booking is final) ----
    await SlotHold.deleteMany({
      date,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    });

    // ---- 6) Best-effort membership usage ----
    try {
      const mem = await Membership.findOne({ userId: String(user.id), status: "PAID" })
        .sort({ createdAt: -1 })
        .lean();
      if (mem) {
        const toAdd = Math.max(0, selections.length);
        const newUsed = Math.min((mem.gamesUsed || 0) + toAdd, mem.games);
        await Membership.updateOne({ _id: mem._id }, { $set: { gamesUsed: newUsed } });
      }
    } catch (e) {
      console.error("Membership consumption failed:", e);
      // do not fail the booking for membership update issues
    }

    return NextResponse.json({ ok: true, bookingId: String(saved._id), booking: saved });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Booking upsert failed:", message);
    return NextResponse.json(
      { ok: false, error: message || "Booking upsert failed", debug: { orderId, date, selections } },
      { status: 500 }
    );
  }
}
