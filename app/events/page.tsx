// app/events/page.tsx
import { dbConnect } from "@/lib/db";
import Event from "@/models/Event";
import Link from "next/link";

type EventRow = {
  _id: string;
  title: string;
  startDate: string;            // "YYYY-MM-DD"
  endDate: string;              // "YYYY-MM-DD"
  startTime?: string | null;    // "HH:mm"
  endTime?: string | null;      // "HH:mm"
  entryFee?: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Build sortable keys like "YYYY-MM-DDTHH:mm"
function buildKeys(ev: EventRow) {
  const startTime = ev.startTime || "00:00";
  const endTime = ev.endTime || "23:59";
  const startKey = `${ev.startDate}T${startTime}`;
  const endKey = `${ev.endDate}T${endTime}`;
  return { startKey, endKey };
}

function nowKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
}

function toRange(ev: EventRow) {
  const dateRange =
    ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} → ${ev.endDate}`;
  const timeRange =
    ev.startTime && ev.endTime ? ` • ${ev.startTime}–${ev.endTime}` : "";
  return `${dateRange}${timeRange}`;
}

export default async function EventsPage() {
  await dbConnect();

  // Do NOT assert the lean() result to EventRow[]. First normalize _id to string.
  const raw = await Event.find({}).lean();

  type RawDoc = {
    _id: unknown;
    title?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    entryFee?: unknown;
  };

  const list: EventRow[] = (raw as unknown[]).map((d) => {
    const doc = d as RawDoc;
    return {
      _id: String(doc._id),
      title: String(doc.title ?? ""),
      startDate: String(doc.startDate ?? ""),
      endDate: String(doc.endDate ?? doc.startDate ?? ""),
      startTime: doc.startTime != null ? String(doc.startTime) : null,
      endTime: doc.endTime != null ? String(doc.endTime) : null,
      entryFee: typeof doc.entryFee === "number" ? doc.entryFee : undefined,
    };
  });

  const now = nowKey();

  const upcoming: (EventRow & { startKey: string })[] = [];
  const past: (EventRow & { endKey: string })[] = [];

  for (const ev of list) {
    const { startKey, endKey } = buildKeys(ev);
    if (endKey >= now) {
      upcoming.push({ ...ev, startKey });
    } else {
      past.push({ ...ev, endKey });
    }
  }

  // Sort upcoming soonest first
  upcoming.sort((a, b) => (a.startKey < b.startKey ? -1 : a.startKey > b.startKey ? 1 : 0));
  // Sort past oldest first so the farthest past is at the very bottom
  past.sort((a, b) => (a.endKey < b.endKey ? -1 : a.endKey > b.endKey ? 1 : 0));

  return (
    <div className="book-page">
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>
            Events & Announcements
          </h1>
          <Link href="/home" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
            ← Home
          </Link>
        </div>

        <div className="grid" style={{ gap: 12 }}>
          {/* Upcoming (clickable) */}
          {upcoming.map((ev) => (
            <Link
              key={ev._id}
              href={`/events/${ev._id}`}
              className="card"
              style={{
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.12)",
                color: "#111",
                cursor: "pointer",
              }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontWeight: 900 }}>{ev.title}</h2>
                {typeof ev.entryFee === "number" && ev.entryFee > 0 ? (
                  <div style={{ fontWeight: 800 }}>₹{ev.entryFee}</div>
                ) : (
                  <div style={{ fontWeight: 800, opacity: 0.75 }}>Free</div>
                )}
              </div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>{toRange(ev)}</div>
            </Link>
          ))}

          {/* Past (disabled, at the bottom) */}
          {past.map((ev) => (
            <div
              key={ev._id}
              className="card"
              aria-disabled="true"
              title="This event has ended"
              style={{
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(0,0,0,0.08)",
                color: "#111",
                opacity: 0.55,
                pointerEvents: "none",
              }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontWeight: 900 }}>{ev.title}</h2>
                {typeof ev.entryFee === "number" && ev.entryFee > 0 ? (
                  <div style={{ fontWeight: 800 }}>₹{ev.entryFee}</div>
                ) : (
                  <div style={{ fontWeight: 800, opacity: 0.75 }}>Free</div>
                )}
              </div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>{toRange(ev)}</div>
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                Event over
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
