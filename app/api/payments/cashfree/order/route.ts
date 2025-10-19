// app/api/payments/cashfree/order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

/** Prefer explicit env, else infer from proxy headers, else localhost (dev). */
function getBaseUrl(req: NextRequest) {
  // Use only the origin (protocol + host). If an env var has a path (e.g. /home), strip it.
  const envUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (envUrl) {
    try {
      return new URL(envUrl).origin; // strips any path like /home
    } catch {
      // fallback: remove trailing slash; caller must ensure it's an origin
      return envUrl.replace(/\/+$/, "");
    }
  }

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = "INR", customer } = await req.json();
    if (!amount || !customer?.name || !customer?.email || !customer?.phone) {
      return NextResponse.json({ error: "Missing amount or customer details" }, { status: 400 });
    }

    // Generate a clean alphanumeric ID from name
    const cleanCustomerId =
      customer.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 45) || "guest_user";

    const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const idempotencyKey = uuidv4();

    const baseUrl = getBaseUrl(req); // ← dynamic origin (no /home suffix)
    const returnUrl = `${baseUrl}/book/checkout?order_id={order_id}`;

    const res = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-version": API_VERSION,
        "x-client-id": process.env.CASHFREE_APP_ID || "",
        "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: currency,
        customer_details: {
          customer_id: cleanCustomerId,
          customer_email: customer.email,
          customer_phone: customer.phone,
          customer_name: customer.name,
        },
        order_meta: {
          return_url: returnUrl,
          // Optionally:
          // notify_url: `${baseUrl}/api/payments/cashfree/webhook`,
        },
        order_note: "Court booking payment",
      }),
    });

    const data: unknown = await res.json();
    if (!res.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? String((data as { message?: unknown }).message)
          : "Cashfree order error";
      return NextResponse.json({ error: message, details: data }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      orderId,
      paymentSessionId:
        typeof data === "object" && data && "payment_session_id" in data
          ? String((data as { payment_session_id?: unknown }).payment_session_id)
          : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
