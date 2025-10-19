// app/api/bookings/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/models/Booking";
import Refund from "@/models/Refund";
import Membership from "@/models/Membership";
import { cookies } from "next/headers";
import jwt, { type JwtPayload } from "jsonwebtoken";

const COOKIE_NAME = "kreede_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// Cashfree config
const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

// ---- types ----
type Me = { id: string; [k: string]: unknown };
type TokenPayload = JwtPayload & { user?: Me };
type Payment = { payment_status?: string; status?: string; [k: string]: unknown };
type MembershipLike = {
  createdAt?: string | Date;
  durationMonths?: number | string;
  status?: string;
  _id?: unknown;
  gamesUsed?: number;
};

// ---- helpers ----
async function getMe(): Promise<Me | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return (p?.user as Me) ?? null;
  } catch {
    return null;
  }
}

function perSlotAmount(total: number, count: number) {
  if (!count || count <= 0) return 0;
  return Math.round((total / count) * 100) / 100;
}

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
  const data: unknown = await r.json();
  if (!r.ok) {
    const msg = typeof data === "object" && data && "message" in data ? String((data as { message?: unknown }).message) : undefined;
    throw new Error(msg || "Failed to fetch payments");
  }
  return Array.isArray(data) ? (data as Payment[]) : [];
}

async function createRefund(orderId: string, amount: number) {
  const refund_id = `refund_${orderId}_${Date.now()}`;
  const r = await fetch(`${BASE}/orders/${orderId}/refunds`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID || "",
      "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ refund_amount: amount, refund_id }),
    cache: "no-store",
  });
  const data: unknown = await r.json();
  if (!r.ok) {
    const msg = typeof data === "object" && data && "message" in data ? String((data as { message?: unknown }).message) : undefined;
    throw new Error(msg || "Refund failed");
  }
  return { refund_id, data };
}

// (optional) helper to check membership expiry if your schema doesn't have expiresAt
function isMembershipActive(mem: MembershipLike, now = new Date()) {
  if (!mem?.createdAt || !mem?.durationMonths) return true; // fallback
  const created = new Date(mem.createdAt);
  const expires = new Date(created);
  expires.setMonth(expires.getMonth() + Number(mem.durationMonths || 0));
  return mem.status === "PAID" && expires.getTime() > now.getTime();
}

// ---- route ----
export async function POST(req: NextRequest) {
  await dbConnect();

  const me = await getMe();
  if (!me?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { bookingId, slotIndex } = await req.json().catch(() => ({} as { bookingId?: string; slotIndex?: number }));
  if (!bookingId || typeof slotIndex !== "number") {
    return NextResponse.json({ error: "Missing bookingId or slotIndex" }, { status: 400 });
  }

  // Load the booking and verify ownership
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (String(booking.userId) !== String(me.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slots = booking.slots || [];
  if (slotIndex < 0 || slotIndex >= slots.length) {
    return NextResponse.json({ error: "Invalid slot index" }, { status: 400 });
  }

  // Compute per-slot refund from the CURRENT booking state
  const perAmount = perSlotAmount(booking.amount || 0, slots.length || 1);

  // Membership booking detection
  const membershipFree = booking.paymentRef === "MEMBERSHIP" || perAmount <= 0;

  let refundStatus: "SUCCESS" | "FAILED" | "NO_PAYMENT" = membershipFree ? "NO_PAYMENT" : "FAILED";
  const gateway: "CASHFREE" | "NONE" = membershipFree ? "NONE" : "CASHFREE";
  let refundId: string | undefined;
  let gatewayResponse: unknown | undefined;

  // If paid via Cashfree and status PAID, attempt refund
  if (!membershipFree && booking.status === "PAID" && booking.orderId) {
    try {
      const pays = await getOrderPayments(booking.orderId);
      const ok = pays.find((p) => (p.payment_status || p.status) === "SUCCESS");
      if (!ok) throw new Error("No successful payment found to refund.");

      const { refund_id, data } = await createRefund(booking.orderId, perAmount);
      refundStatus = "SUCCESS";
      refundId = refund_id;
      gatewayResponse = data;
    } catch (e: unknown) {
      // If you want to hard-fail on refund error, return here instead.
      refundStatus = "FAILED";
      const message = e instanceof Error ? e.message : "Refund failed";
      gatewayResponse = { error: message };
    }
  }

  // Remove the slot:
  if (slots.length === 1) {
    // last slot => delete whole booking
    await Booking.deleteOne({ _id: bookingId });
  } else {
    // remove index and **reduce amount** so future refunds are correct
    const newSlots = [...slots];
    newSlots.splice(slotIndex, 1);

    const newAmount = Math.max(0, Math.round(((booking.amount || 0) - perAmount) * 100) / 100);

    await Booking.updateOne(
      { _id: bookingId },
      {
        $set: {
          slots: newSlots,
          amount: newAmount, // ← keep amount in sync with remaining slots
          updatedAt: new Date(),
        },
      }
    );
  }

  // Reverse membership usage if it was a membership booking
  if (membershipFree) {
    const now = new Date();
    const mem = (await Membership.findOne(
      {
        userId: String(me.id),
        status: "PAID",
        gamesUsed: { $gt: 0 }, // don't go below zero
      },
      {},
      { sort: { createdAt: -1 } }
    ).lean()) as MembershipLike | null;

    if (mem && isMembershipActive(mem, now)) {
      await Membership.findOneAndUpdate(
        { _id: mem._id, gamesUsed: { $gt: 0 } },
        { $inc: { gamesUsed: -1 } },
        { new: true }
      );
    }
  }

  // Refund log (even for membership/no-payment)
  await Refund.create({
    userId: String(me.id),
    userEmail: booking.userEmail,
    userName: booking.userName,
    source: "BOOKING",
    bookingId: String(bookingId),
    orderId: booking.orderId,
    slotIndex,
    amount: perAmount, // per-slot refund value
    currency: booking.currency || "INR",
    paymentRef: booking.paymentRef,
    gateway,
    refundId,
    gatewayResponse,
    status: refundStatus,
    reason: membershipFree
      ? "Membership booking cancellation (credit restored)"
      : "Booking cancellation refund",
    meta: {
      before: { amount: booking.amount, slotsCount: slots.length },
      unitRefund: perAmount,
    },
  });

  if (!membershipFree && refundStatus === "FAILED") {
    return NextResponse.json(
      { ok: true, message: "Slot cancelled, but refund failed to issue. Support will review." },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}
