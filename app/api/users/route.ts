import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User } from "@/app/models/User";
import { setAuthCookie, type SafeUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await dbConnect();
  const { userId, name, email, phone, dob } = await req.json();

  if (!userId || !name || !email) {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  const exists = await User.findOne({
    $or: [{ userId }, { email: String(email).toLowerCase().trim() }],
  }).lean();

  if (exists) {
    return NextResponse.json({ success: false, error: "User already exists" }, { status: 409 });
  }

  const doc = await User.create({
    userId,
    name,
    email: String(email).toLowerCase().trim(),
    phone: phone || "",
    dob: dob || null,
  });

  // Build response
  const res = NextResponse.json({
    success: true,
    user: { id: String(doc._id), userId: doc.userId, name: doc.name, email: doc.email },
  });

  // Set auth cookie using lib/auth helper
  const safeUser: SafeUser = {
    id: String(doc._id),
    userId: doc.userId,
    name: doc.name,
    email: doc.email,
    phone: doc.phone || "",
  };
  setAuthCookie(res, safeUser);

  return res;
}
