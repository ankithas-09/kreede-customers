// app/api/memberships/create-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Membership from "@/models/Membership";

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
  "1M": { planName: "1 month", durationMonths: 1, games: 25, amount: 2999 },
  "3M": { planName: "3 months", durationMonths: 3, games: 75, amount: 8999 },
  "6M": { planName: "6 months", durationMonths: 6, games: 150, amount: 17999 },
} as const;

// prefer env, else infer from headers, else localhost (dev)
function getBaseUrl(req: NextRequest) {
  const envUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (envUrl) {
    try {
      // strip any accidental path like /home; keep only origin
      return new URL(envUrl).origin;
    } catch {
      return envUrl.replace(/\/+$/, "");
    }
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

// Minimal shape we read from Cashfree response
type CashfreeOrderResponse = {
  payment_session_id?: string;
  message?: string;
  [k: string]: unknown;
};

export async function POST(req: NextRequest) {
  await dbConnect();

  const { planId, user } = (await req.json()) as Body;
  if (!planId || !user?.id || !user?.email) {
    return NextResponse.json({ error: "Missing planId or user" }, { status: 400 });
  }
  const plan = PLAN_MAP[planId];
  if (!plan) return NextResponse.json({ error: "Invalid planId" }, { status: 400 });

  // Unique membership order id
  const orderId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 1) Create/ensure pending membership (idempotent on orderId)
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
  const baseUrl = getBaseUrl(req);
  const returnUrl = `${baseUrl}/membership?order_id={order_id}`;

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
      return_url: returnUrl,
      // notify_url: `${baseUrl}/api/payments/cashfree/webhook` // optional
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

  const j = (await resCF.json()) as unknown as CashfreeOrderResponse;

  if (!resCF.ok) {
    const message =
      typeof j === "object" && j && "message" in j && typeof j.message === "string"
        ? j.message
        : "Cashfree order failed";
    return NextResponse.json({ error: message, details: j }, { status: 500 });
  }

  const paymentSessionId =
    typeof j === "object" && j && "payment_session_id" in j && typeof j.payment_session_id !== "undefined"
      ? String(j.payment_session_id)
      : undefined;

  return NextResponse.json({
    paymentSessionId,
    orderId,
  });
}
