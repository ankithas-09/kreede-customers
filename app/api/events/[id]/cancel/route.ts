// app/api/events/[id]/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Registration from "@/models/Registration";
import Event from "@/models/Event";
import EventRefund from "@/models/EventRefund";
import { cookies } from "next/headers";
import jwt, { type JwtPayload } from "jsonwebtoken";

const COOKIE_NAME = "kreede_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

// ---- types ----
type Me = { id: string; email?: string; name?: string; [k: string]: unknown };
type TokenPayload = JwtPayload & { user?: Me };
type Payment = { payment_status?: string; status?: string; [k: string]: unknown };

// ---- helpers ----
function getUserFromCookie(token?: string): Me | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return (p?.user as Me) ?? null;
  } catch {
    return null;
  }
}

function parseEventStart(startDate: string, startTime?: string) {
  const [y, m, d] = startDate.split("-").map(Number);
  let h = 0,
    min = 0;
  if (startTime) {
    const [hh, mm] = startTime.split(":").map(Number);
    if (!Number.isNaN(hh)) h = hh;
    if (!Number.isNaN(mm)) min = mm;
  }
  return new Date(y, m - 1, d, h, min, 0, 0);
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
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : undefined;
    throw new Error(msg || "Failed to fetch payments");
  }
  return Array.isArray(data) ? (data as Payment[]) : [];
}

async function refundOrder(orderId: string, amount: number) {
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
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : undefined;
    throw new Error(msg || "Refund failed");
  }
  return { refund_id, data };
}

// ---- route ----
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await ctx.params;

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const user = getUserFromCookie(token);
  if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Event & cutoff
  const ev = await Event.findById(id).lean().catch(() => null);
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const eventStart = parseEventStart(ev.startDate, ev.startTime);
  const cutoff = new Date(eventStart.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days before
  const now = new Date();
  if (now > cutoff) {
    return NextResponse.json(
      { error: "Cancellation window has closed (deadline is 2 days before the event)." },
      { status: 403 }
    );
  }

  // Registration
  const reg = await Registration.findOne({ eventId: id, userId: user.id }).lean();
  if (!reg) return NextResponse.json({ error: "No registration found" }, { status: 404 });

  // Evaluate payment/refund
  const isPaid = reg.paymentStatus === "PAID" && Number(reg.amount) > 0 && reg.orderId;
  let refundStatus: "SUCCESS" | "FAILED" | "NO_PAYMENT" = "NO_PAYMENT";
  let gateway: "CASHFREE" | "NONE" = "NONE";
  let refundId: string | undefined;
  let gatewayResponse: unknown | undefined;
  const refundAmount = Number(reg.amount || 0);

  if (isPaid) {
    gateway = "CASHFREE";
    try {
      // Optional: verify a successful payment exists
      const pays = await getOrderPayments(reg.orderId as string);
      const okPay = pays.find((p) => (p.payment_status || p.status) === "SUCCESS");
      if (!okPay) throw new Error("No successful payment found to refund.");

      const { refund_id, data } = await refundOrder(reg.orderId as string, refundAmount);
      refundStatus = "SUCCESS";
      refundId = refund_id;
      gatewayResponse = data;
    } catch (e: unknown) {
      refundStatus = "FAILED";
      const message = e instanceof Error ? e.message : "Refund failed";
      gatewayResponse = { error: message };
      // If you prefer to abort the cancellation when refund fails, return 400 here.
    }
  }

  // Remove the registration record
  await Registration.deleteOne({ _id: reg._id });

  // Log to event_refunds
  await EventRefund.create({
    userId: String(user.id),
    userEmail: user.email,
    userName: user.name,
    eventId: String(id),
    eventTitle: reg.eventTitle || ev.title,
    registrationId: String(reg._id),
    orderId: reg.orderId,
    amount: isPaid ? refundAmount : 0,
    currency: "INR",
    gateway,
    refundId,
    gatewayResponse,
    status: refundStatus,
    reason: isPaid ? "Event registration cancellation refund" : "Free event registration cancellation",
  });

  // Final response
  if (isPaid && refundStatus === "FAILED") {
    return NextResponse.json(
      { ok: true, message: "Registration cancelled, but refund failed to issue. Support will review." },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}
