// app/api/events/[id]/registered/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Registration from "@/models/Registration";
import { cookies } from "next/headers";
import jwt, { type JwtPayload } from "jsonwebtoken";

const COOKIE_NAME = "kreede_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

type Me = {
  id: string;
  userId: string;
  email: string;
  name?: string;
  phone?: string;
  [k: string]: unknown;
};

function extractUser(payload: unknown): Me | null {
  if (!payload || typeof payload !== "object") return null;

  // Case 1: { user: {...} }
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

  // Case 2: flat payload
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

  // Case 3: sub as id
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
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload | string;
    return extractUser(decoded);
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await ctx.params;

  const user = await getUser();
  if (!user) {
    // not signed in → not registered
    return NextResponse.json({ ok: true, registered: false });
  }

  const exists = await Registration.exists({ eventId: id, userId: String(user.id) });
  return NextResponse.json({ ok: true, registered: !!exists });
}
