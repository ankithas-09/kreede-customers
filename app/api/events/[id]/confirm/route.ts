// app/api/events/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Event from "@/models/Event";
import Registration from "@/models/Registration";
import { cookies } from "next/headers";
import jwt, { type JwtPayload } from "jsonwebtoken";

const COOKIE_NAME = "kreede_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";

type Me = { id: string; email?: string; name?: string; userId?: string; [k: string]: unknown };
type TokenPayload = JwtPayload & { user?: Me };
type Payment = {
  payment_status?: string;
  status?: string;
  cf_payment_id?: string;
  payment_id?: string;
  [k: string]: unknown;
};

function getUserFromCookie(token?: string): Me | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return (p?.user as Me) ?? null;
  } catch {
    return null;
  }
}

async function getPayments(orderId: string): Promise<Payment[]> {
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
    throw new Error(msg || "Failed payments fetch");
  }
  return Array.isArray(data) ? (data as Payment[]) : [];
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await ctx.params;

  const { orderId } = (await req.json()) as { orderId?: string };
  if (!orderId && orderId !== "") {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const user = getUserFromCookie(token);
  if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ev = await Event.findById(id).lean().catch(() => null);
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Verify payment (or treat as FREE if no entryFee > 0)
  let amount = 0;
  let paymentId: string | undefined;

  if (ev.entryFee && Number(ev.entryFee) > 0) {
    const pay = await getPayments(orderId as string);
    const success = pay.find((p) => (p.payment_status || p.status) === "SUCCESS");
    if (!success) {
      return NextResponse.json({ error: "Payment not successful" }, { status: 400 });
    }
    paymentId = success.cf_payment_id || success.payment_id || undefined;
    amount = Number(ev.entryFee);
  }

  // Upsert (idempotent) registration
  const doc = await Registration.findOneAndUpdate(
    { eventId: id, userId: user.id },
    {
      eventId: id,
      eventTitle: ev.title,
      userId: user.id,
      userName: user.name || user.userId,
      userEmail: user.email,
      orderId: ev.entryFee ? (orderId as string) : undefined,
      paymentId,
      amount: ev.entryFee ? amount : undefined,
      paymentStatus: ev.entryFee ? "PAID" : "FREE",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();

  return NextResponse.json({ ok: true, registration: doc });
}
