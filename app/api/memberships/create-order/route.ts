import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Membership from "@/app/models/Membership";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

type Body = {
  planId: "1M" | "3M" | "6M";
  user: { id: string; name?: string; email: string };
};

const PLAN_MAP = {
  "1M": { planName: "1 month", durationMonths: 1, games: 30, amount: 5000 },
  "3M": { planName: "3 months", durationMonths: 3, games: 90, amount: 12000 },
  "6M": { planName: "6 months", durationMonths: 6, games: 150, amount: 20000 },
} as const;

export async function POST(req: NextRequest) {
  await dbConnect();

  const { planId, user } = (await req.json()) as Body;
  if (!planId || !user?.id || !user?.email) {
    return NextResponse.json({ error: "Missing planId or user" }, { status: 400 });
  }
  const plan = PLAN_MAP[planId];
  if (!plan) return NextResponse.json({ error: "Invalid planId" }, { status: 400 });

  // Create a unique order id (your style)
  const orderId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 1) Create a pending membership doc (idempotent by orderId)
  await Membership.findOneAndUpdate(
    { orderId },
    {
      orderId,
      userId: String(user.id),
      userName: user.name || "",
      userEmail: user.email,
      planId,
      planName: plan.planName,
      durationMonths: plan.durationMonths,
      games: plan.games,
      amount: plan.amount,
      currency: "INR",
      status: "PENDING",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 2) Create Cashfree order
  const body = {
    order_id: orderId,
    order_amount: plan.amount,
    order_currency: "INR",
    order_note: `membership:${planId}`,
    customer_details: {
      customer_id: String(user.id),
      customer_name: user.name || "Member",
      customer_email: user.email,
      customer_phone: "9999999999",
    },
    order_meta: {
      // Redirect back to this page (membership UI) with the order_id
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/membership?order_id={order_id}`,
    },
  };

  const resCF = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID || "",
      "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const j = await resCF.json();
  if (!resCF.ok) {
    return NextResponse.json({ error: j?.message || "Cashfree order failed" }, { status: 500 });
  }

  return NextResponse.json({ paymentSessionId: j.payment_session_id, orderId });
}
