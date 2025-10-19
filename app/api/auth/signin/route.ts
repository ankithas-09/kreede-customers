import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { User, type IUser } from "@/models/User";
import { setAuthCookie } from "@/lib/auth";
import { Types } from "mongoose";

type IUserLean = Pick<IUser, "userId" | "name" | "email" | "phone"> & { _id: Types.ObjectId };

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    const email  = String(body?.email  || "").toLowerCase().trim();

    if (!userId || !email) {
      return NextResponse.json({ success: false, error: "UserID and Email are required." }, { status: 400 });
    }

    const user = await User.findOne({ userId, email })
      .select("_id userId name email phone")
      .lean<IUserLean>();

    if (!user) {
      return NextResponse.json({ success: false, error: "No matching member found." }, { status: 401 });
    }

    const safeUser = {
      id: String(user._id),
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone ?? undefined,
    };

    const res = NextResponse.json({ success: true, user: safeUser });
    setAuthCookie(res, safeUser);
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
