// app/api/guest/payments/cashfree/order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

// Use only the origin (protocol + host). If env has a path, strip it.
function getBaseUrl(req: NextRequest) {
  const envUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (envUrl) {
    try {
      return new URL(envUrl).origin;
    } catch {
      return envUrl.replace(/\/+$/, "");
    }
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = "INR", guest } = (await req.json()) as {
      amount?: number;
      currency?: string;
      guest?: { name?: string; phone?: string };
    };

    if (!amount || !guest?.name || !guest?.phone) {
      return NextResponse.json({ error: "Missing amount or guest details" }, { status: 400 });
    }

    const orderId = `g_order_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const idempotencyKey = uuidv4();

    const baseUrl = getBaseUrl(req);
    const returnUrl = `${baseUrl}/book/checkout?guest=1&order_id={order_id}`;

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
          customer_id: `guest_${orderId}`,
          customer_email: "guest@example.com", // guests don’t provide email
          customer_phone: guest.phone,
          customer_name: guest.name,
        },
        order_meta: {
          return_url: returnUrl,
        },
        order_note: "Guest court booking payment",
      }),
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined; // leave undefined if not JSON
    }

    if (!res.ok) {
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "message" in parsed
          ? String((parsed as { message?: unknown }).message)
          : `Cashfree order error (${res.status})`;

      return NextResponse.json(
        { error: message, details: parsed ?? text },
        { status: 500 }
      );
    }

    // Extract paymentSessionId safely (supports both snake_case and camelCase)
    let paymentSessionId: string | undefined;
    if (typeof parsed === "object" && parsed !== null) {
      if ("payment_session_id" in parsed && typeof (parsed as { payment_session_id?: unknown }).payment_session_id === "string") {
        paymentSessionId = (parsed as { payment_session_id: string }).payment_session_id;
      } else if ("paymentSessionId" in parsed && typeof (parsed as { paymentSessionId?: unknown }).paymentSessionId === "string") {
        paymentSessionId = (parsed as { paymentSessionId: string }).paymentSessionId;
      }
    }

    return NextResponse.json({
      ok: true,
      orderId,
      paymentSessionId,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
