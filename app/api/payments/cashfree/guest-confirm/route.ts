// app/api/payments/cashfree/guest-confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";
import GuestBooking from "@/models/GuestBooking";
import SlotHold from "@/models/SlotHold";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

type Payment = { payment_status?: string; status?: string; [k: string]: unknown };
type GuestIn = { name?: string; phone?: string; email?: string };
type Selection = { courtId: number; start: string; end: string };

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

  const { orderId, guest, date, selections, amount, clientId } = (await req.json()) as {
    orderId?: string;
    guest?: GuestIn;
    date?: string;
    selections?: Selection[];
    amount?: number;
    clientId?: string;
  };

  if (!orderId || !guest?.name || !guest?.phone || !date || !Array.isArray(selections) || typeof amount !== "number") {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  // 1) Verify payment with Cashfree
  const payments = await getOrderPayments(orderId);
  const paid = payments.some((p) => (p.payment_status || p.status) === "SUCCESS");
  if (!paid) {
    return NextResponse.json(
      { ok: false, error: "Payment not successful yet.", debug: { payments } },
      { status: 400 }
    );
  }

  // 2) Block if any slot is already PAID in either collection
  const [userBooked, guestBooked] = await Promise.all([
    Booking.aggregate<{ key: string }>([
      { $match: { date, status: "PAID" } },
      { $unwind: "$slots" },
      { $project: { _id: 0, key: { $concat: [{ $toString: "$slots.courtId" }, "|", "$slots.start"] } } },
    ]),
    GuestBooking.aggregate<{ key: string }>([
      { $match: { date, status: "PAID" } },
      { $unwind: "$slots" },
      { $project: { _id: 0, key: { $concat: [{ $toString: "$slots.courtId" }, "|", "$slots.start"] } } },
    ]),
  ]);
  const bookedSet = new Set<string>([
    ...userBooked.map((x) => x.key),
    ...guestBooked.map((x) => x.key),
  ]);
  const conflict = selections.find((s) => bookedSet.has(`${s.courtId}|${s.start}`));
  if (conflict) {
    return NextResponse.json(
      { ok: false, error: `Slot Court ${conflict.courtId} • ${conflict.start}-${conflict.end} is already booked.` },
      { status: 409 }
    );
  }

  // 3) Optionally enforce clientId to ensure the holder finalizes
  if (clientId) {
    const holds = await SlotHold.find({
      date,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    }).lean();

    const foreignHold = holds.find((h) => h.clientId && h.clientId !== clientId);
    if (foreignHold) {
      return NextResponse.json(
        {
          ok: false,
          error: `Slot Court ${foreignHold.courtId} • ${foreignHold.start} is on hold by another user.`,
        },
        { status: 409 }
      );
    }
  }

  // 4) Upsert guest booking (idempotent on orderId)
  const updateDoc = {
    orderId,
    userName: guest.name || "",
    userEmail: guest.email || "",
    date,
    slots: selections.map((s) => ({ courtId: s.courtId, start: s.start, end: s.end })),
    amount,
    currency: "INR" as const,
    status: "PAID" as const,
    paymentRef: "CASHFREE",
    paymentRaw: payments,
  };

  await GuestBooking.findOneAndUpdate(
    { orderId },
    updateDoc,
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, strict: true }
  );

  const saved = await GuestBooking.findOne({ orderId }).lean();
  if (!saved?._id) {
    return NextResponse.json(
      { ok: false, error: "Guest booking write failed (not found after upsert)." },
      { status: 500 }
    );
  }

  // 5) Clear holds for these slots
  await SlotHold.deleteMany({
    date,
    $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
  });

  return NextResponse.json({ ok: true, bookingId: String(saved._id), booking: saved });
}
