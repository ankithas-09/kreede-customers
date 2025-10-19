import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    const name   = String(body?.name   || "").trim();
    const email  = String(body?.email  || "").toLowerCase().trim();
    const phone  = body?.phone ? String(body.phone).trim() : undefined;
    const dob    = body?.dob ? String(body.dob).trim() : undefined;

    if (!userId || !name || !email) {
      return NextResponse.json({ success: false, error: "UserID, Name and Email are required." }, { status: 400 });
    }

    const existing = await User.findOne({ $or: [{ userId }, { email }] }).select("_id").lean();
    if (existing) {
      return NextResponse.json({ success: false, error: "User with same UserID or Email already exists." }, { status: 409 });
    }

    const created = await User.create({ userId, name, email, phone, dob });

    const safeUser = {
      id: String(created._id),
      userId: created.userId,
      name: created.name,
      email: created.email,
      phone: created.phone ?? undefined,
    };

    const res = NextResponse.json({ success: true, user: safeUser });
    setAuthCookie(res, safeUser);
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
