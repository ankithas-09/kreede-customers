import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Registration from "@/app/models/Registration";
import { readAuthCookie } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id: eventId } = await params;

    // ✅ FIXED — no argument needed
    const payload = await readAuthCookie();
    const user = payload?.user as { id?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ ok: true, registered: false }, { status: 200 });
    }

    const reg = await Registration.findOne({
      eventId,
      userId: String(user.id),
    })
      .select("_id createdAt")
      .lean();

    return NextResponse.json({
      ok: true,
      registered: !!reg,
      registrationId: reg?._id ? String(reg._id) : undefined,
      registeredAt: reg?.createdAt ?? undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to check status";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
