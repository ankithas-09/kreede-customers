// app/api/guest/payments/cashfree/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import GuestBooking from "@/models/GuestBooking";
import SlotHold from "@/models/SlotHold";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

type Payment = { payment_status?: string; status?: string; [k: string]: unknown };
type Selection = { courtId: number; start: string; end: string };

async function getOrderPayments(orderId: string): Promise<Payment[]> {
  const r = await fetch(`${BASE}/orders/${orderId}/payments`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID || "",
      "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
    },
    cache: "no-store",
  });

  const text = await r.text();
  let dataUnknown: unknown = [];
  try {
    dataUnknown = JSON.parse(text);
  } catch {
    // leave as []
  }

  if (!r.ok) {
    const msg =
      typeof dataUnknown === "object" &&
      dataUnknown !== null &&
      "message" in dataUnknown
        ? String((dataUnknown as { message?: unknown }).message)
        : "Failed to fetch Cashfree payments";
    throw new Error(msg);
  }

  return Array.isArray(dataUnknown) ? (dataUnknown as Payment[]) : [];
}

export async function POST(req: NextRequest) {
  await dbConnect();

  // Note: we don't need clientId here; removing unused binding avoids lint warning.
  const { orderId, guest, date, selections, amount } = (await req.json()) as {
    orderId?: string;
    guest?: { name?: string; phone?: string; email?: string };
    date?: string;
    selections?: Selection[];
    amount?: number;
    clientId?: string;
  };

  if (
    !orderId ||
    !guest?.name ||
    !guest?.phone ||
    !date ||
    !Array.isArray(selections) ||
    typeof amount !== "number"
  ) {
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

  // 2) Upsert guest booking (idempotent on orderId) and store the phone number
  const updateDoc = {
    orderId,
    userName: guest.name || "",
    userEmail: guest.email || "",
    phone_number: guest.phone || "", // ← NEW: persist phone number
    date,
    slots: selections.map((s) => ({ courtId: s.courtId, start: s.start, end: s.end })),
    amount,
    currency: "INR" as const,
    status: "PAID" as const,
    paymentRef: "PAID.CASH",        // keep your existing convention if you rely on it
    paymentRaw: payments,
  };

  await GuestBooking.findOneAndUpdate(
    { orderId },
    updateDoc,
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, strict: true }
  );

  // 3) Best-effort: clear holds for these slots
  try {
    await SlotHold.deleteMany({
      date,
      $or: selections.map((s) => ({ courtId: s.courtId, start: s.start })),
    });
  } catch {
    // non-fatal
  }

  const saved = await GuestBooking.findOne({ orderId }).lean();
  if (!saved?._id) {
    return NextResponse.json(
      { ok: false, error: "Guest booking write failed (not found after upsert)." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, bookingId: String(saved._id), booking: saved });
}
