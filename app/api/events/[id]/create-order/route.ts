// app/api/events/[id]/create-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Event from "@/app/models/Event";
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
type Me = {
  id: string;
  userId: string;
  email: string;
  name?: string;
  phone?: string;
  [k: string]: unknown;
};
type TokenPayload = JwtPayload & { user?: Partial<Me>; sub?: string };

// ---- helpers ----
function extractUser(payload: unknown): Me | null {
  if (!payload || typeof payload !== "object") return null;

  // case 1: payload.user container
  if ("user" in payload && payload.user && typeof payload.user === "object") {
    const u = payload.user as Partial<Me>;
    if (u.id && u.userId && u.email) {
      return {
        id: String(u.id),
        userId: String(u.userId),
        email: String(u.email),
        name: u.name ? String(u.name) : undefined,
        phone: u.phone ? String(u.phone) : undefined,
      };
    }
  }

  // case 2: direct fields on payload
  const p = payload as Partial<Me> & { sub?: string };
  if (p.id && p.userId && p.email) {
    return {
      id: String(p.id),
      userId: String(p.userId),
      email: String(p.email),
      name: p.name ? String(p.name) : undefined,
      phone: p.phone ? String(p.phone) : undefined,
    };
  }

  // case 3: sub as id
  if (p.sub && p.userId && p.email) {
    return {
      id: String(p.sub),
      userId: String(p.userId),
      email: String(p.email),
      name: p.name ? String(p.name) : undefined,
      phone: p.phone ? String(p.phone) : undefined,
    };
  }

  return null;
}

async function getUser(): Promise<Me | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload | string;
    return extractUser(decoded);
  } catch {
    return null;
  }
}

function sanCustomerId(id: string) {
  // Cashfree: alphanumeric, underscore, hyphen, <= 45 chars
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 45);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();

  // ✅ Next.js 14 dynamic params must be awaited
  const { id } = await ctx.params;

  // Auth via cookie
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 🔒 Don’t trust client amount. Read from DB.
  const ev = await Event.findById(id).lean().catch(() => null);
  if (!ev) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // entryFee can be number or string in DB — normalize to number
  const feeRaw: unknown = (ev as { entryFee?: unknown }).entryFee;
  const orderAmount =
    typeof feeRaw === "number" ? feeRaw : Number(feeRaw as number | string);

  if (!orderAmount || Number.isNaN(orderAmount) || orderAmount <= 0) {
    return NextResponse.json({ error: "Invalid amount for this event" }, { status: 400 });
  }

  const orderId = `EVT_${id}_${Date.now()}`;
  const returnUrl = `${
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  }/events/${id}?order_id={order_id}`;

  // Create Cashfree order
  const resCF = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-api-version": API_VERSION,
      "content-type": "application/json",
      "x-client-id": process.env.CASHFREE_APP_ID || "",
      "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: "INR",
      customer_details: {
        // 👇 per your requirement: use the current user's userId
        customer_id: sanCustomerId(user.userId),
        customer_name: user.name || user.userId,
        customer_email: user.email,
        customer_phone: user.phone || "9999999999",
      },
      order_meta: { return_url: returnUrl },
    }),
    cache: "no-store",
  });

  const data: unknown = await resCF.json();
  if (!resCF.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : "Cashfree order failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const paymentSessionId =
    typeof data === "object" && data && "payment_session_id" in data
      ? String((data as { payment_session_id?: unknown }).payment_session_id)
      : undefined;

  return NextResponse.json({
    paymentSessionId,
    orderId,
    amount: orderAmount,
  });
}
