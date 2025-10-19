// app/api/events/[id]/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { dbConnect } from "@/lib/db";
import Event from "@/app/models/Event";
import Registration from "@/app/models/Registration";

const COOKIE_NAME = "kreede_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

type JwtUser = { id: string; userId: string; name?: string; email: string; phone?: string };

// Accept both token shapes:
// 1) { id, userId, name, email, phone, ... }
// 2) { user: { id, userId, name, email, phone }, sub, ... }
function extractUserFromPayload(payload: unknown): JwtUser | null {
  if (!payload || typeof payload !== "object") return null;

  // Nested shape
  if ("user" in payload && payload.user && typeof payload.user === "object") {
    const u = payload.user as Partial<JwtUser>;
    if (u?.id && u?.userId && u?.email) {
      return {
        id: String(u.id),
        userId: String(u.userId),
        name: u.name ? String(u.name) : undefined,
        email: String(u.email),
        phone: u.phone ? String(u.phone) : undefined,
      };
    }
  }

  // Flat shape fallback
  const p = payload as Partial<JwtUser> & { sub?: string };
  if (p.id && p.userId && p.email) {
    return {
      id: String(p.id),
      userId: String(p.userId),
      name: p.name ? String(p.name) : undefined,
      email: String(p.email),
      phone: p.phone ? String(p.phone) : undefined,
    };
  }

  // sub as id
  if (p.sub && p.email && p.userId) {
    return {
      id: String(p.sub),
      userId: String(p.userId),
      name: p.name ? String(p.name) : undefined,
      email: String(p.email),
      phone: p.phone ? String(p.phone) : undefined,
    };
  }

  return null;
}

async function getUserFromCookie(): Promise<JwtUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload | string;
    const user = extractUserFromPayload(decoded);
    return user;
  } catch (e: unknown) {
    console.error("[register] jwt verify error:", e);
    return null;
  }
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await dbConnect();

  const { id } = await ctx.params; // IMPORTANT: await params in app router
  const user = await getUserFromCookie();

  // Debug logs (safe to keep while debugging)
  console.log("[register] params.id:", id);
  console.log("[register] user:", user);

  if (!id || !user) {
    const diagnostics =
      process.env.NODE_ENV !== "production"
        ? { gotEventId: Boolean(id), gotUser: Boolean(user) }
        : undefined;

    return NextResponse.json(
      { error: "Missing eventId or user", diagnostics },
      { status: 400 }
    );
  }

  const ev = await Event.findById(id).lean().catch(() => null);
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  try {
    // Upsert to prevent duplicates (unique index on { eventId, userId })
    const reg = await Registration.findOneAndUpdate(
      { eventId: id, userId: user.id },
      {
        eventId: id,
        eventTitle: ev.title,
        userId: user.id,
        userName: user.name || user.userId,
        userEmail: user.email,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return NextResponse.json({ ok: true, registration: reg });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code?: unknown }).code
        : undefined;

    if (code === 11000) {
      // Already registered (unique index)
      return NextResponse.json({ ok: true, alreadyRegistered: true });
    }

    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[register] upsert error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
