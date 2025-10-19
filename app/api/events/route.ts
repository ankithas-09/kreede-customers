// app/api/events/route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Event from "@/app/models/Event";

export async function GET() {
  await dbConnect();

  // Build a "YYYY-MM-DDTHH:mm" key for *now* (server local time)
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowKey =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Use an aggregation so we can treat missing times nicely and filter/sort in Mongo
  const events = await Event.aggregate([
    {
      $addFields: {
        _startTimeSafe: { $ifNull: ["$startTime", "00:00"] },
        _endTimeSafe: { $ifNull: ["$endTime", "23:59"] },
      },
    },
    {
      $addFields: {
        _startKey: { $concat: ["$startDate", "T", "$_startTimeSafe"] },
        _endKey: { $concat: ["$endDate", "T", "$_endTimeSafe"] },
      },
    },
    // Keep only events that haven't ended yet
    { $match: { _endKey: { $gte: nowKey } } },
    // Sort by start date/time (soonest first)
    { $sort: { _startKey: 1 } },
    // Hide helper fields from the response
    {
      $project: {
        _startTimeSafe: 0,
        _endTimeSafe: 0,
        _startKey: 0,
        _endKey: 0,
      },
    },
  ]).exec();

  return NextResponse.json({ ok: true, events });
}
