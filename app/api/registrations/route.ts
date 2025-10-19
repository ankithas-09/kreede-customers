import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Registration from "@/app/models/Registration";

export async function POST(req: NextRequest) {
  await dbConnect();
  const { eventId, eventTitle, user } = (await req.json()) as {
    eventId?: string;
    eventTitle?: string;
    user?: { id?: string; name?: string; email?: string; phone?: string };
  };

  if (!eventId || !user?.id || !user?.email) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  try {
    const doc = await Registration.findOneAndUpdate(
      { eventId, userId: String(user.id) },
      {
        eventId,
        eventTitle: eventTitle ?? "",
        userId: String(user.id),
        userName: user.name ?? "",
        userEmail: user.email,
        phone: user.phone ?? "",
        feeAmount: 0,
        currency: "INR",
        status: "CONFIRMED",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, strict: true }
    ).lean();

    return NextResponse.json({ ok: true, registration: doc });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to register";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
