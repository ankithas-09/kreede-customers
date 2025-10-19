import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Booking from "@/app/models/Booking";
import Membership from "@/app/models/Membership";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

type Payment = {
  payment_status?: string;
  status?: string;
  [k: string]: unknown;
};

type UserIn = { id?: string; email?: string; name?: string };
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

  const { orderId, user, date, selections, amount } = (await req.json()) as {
    orderId?: string;
    user?: UserIn;
    date?: string;
    selections?: Selection[];
    amount?: number;
  };

  if (
    !orderId ||
    !user?.id ||
    !user?.email ||
    !date ||
    !Array.isArray(selections) ||
    typeof amount !== "number"
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // 1) Verify payment with Cashfree
  const payments = await getOrderPayments(orderId);
  const success = payments.some((p) => (p.payment_status || p.status) === "SUCCESS");
  if (!success) {
    return NextResponse.json(
      { ok: false, message: "Payment not successful yet." },
      { status: 400 }
    );
  }

  // 2) Upsert booking
  const updateDoc = {
    orderId,
    userId: String(user.id),
    userName: user.name || "",
    userEmail: user.email,
    date,
    slots: selections.map((s) => ({ courtId: s.courtId, start: s.start, end: s.end })),
    amount,
    currency: "INR",
    status: "PAID" as const,
    paymentRaw: payments,
  };

  const booking = await Booking.findOneAndUpdate(
    { orderId },
    updateDoc,
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
      strict: true,
    }
  ).lean();

  // 3) 🎯 Consume membership games (latest PAID membership)
  const slotsCount = selections.length; // 1 game per slot
  try {
    const mem = await Membership.findOne({ userId: String(user.id), status: "PAID" })
      .sort({ createdAt: -1 })
      .lean();

    if (mem) {
      const toAdd = Math.max(0, slotsCount);
      // cap gamesUsed at total games
      const newUsed = Math.min((mem.gamesUsed || 0) + toAdd, mem.games);
      await Membership.updateOne({ _id: mem._id }, { $set: { gamesUsed: newUsed } });
    }
  } catch (e) {
    // don’t fail booking on membership update issues
    console.error("Membership consumption failed:", e);
  }

  return NextResponse.json({ ok: true, booking });
}
