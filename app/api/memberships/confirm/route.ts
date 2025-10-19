import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
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

  const { orderId, user } = (await req.json()) as {
    orderId?: string;
    user?: { id?: string };
  };
  if (!orderId || !user?.id) {
    return NextResponse.json({ error: "Missing orderId or user" }, { status: 400 });
  }

  const payments = await getOrderPayments(orderId);
  const success = payments.some((p) => (p.payment_status || p.status) === "SUCCESS");
  if (!success) {
    return NextResponse.json({ ok: false, message: "Payment not successful yet." }, { status: 400 });
  }

  // Mark membership PAID
  const doc = await Membership.findOneAndUpdate(
    { orderId, userId: String(user.id) },
    { status: "PAID", paymentRaw: payments },
    { new: true }
  ).lean();

  if (!doc) {
    return NextResponse.json({ ok: false, message: "Membership not found for this order." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, membership: doc });
}
