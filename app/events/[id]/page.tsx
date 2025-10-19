// app/events/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { dbConnect } from "@/lib/db";
import Event, { type EventDoc } from "@/app/models/Event";
import RegisterButton from "../RegisterButton";

/** Convert a Google Drive "view" link to embeddable preview link */
function toDrivePreview(url?: string) {
  if (!url) return null;
  try {
    const m = url.match(/\/d\/([^/]+)\//);
    if (m?.[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
  } catch {}
  return url;
}

function fmtDate(d?: string) {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EventDetailsPage(props: PageProps) {
  await dbConnect();

  // ✅ Await params & searchParams to avoid Next.js warning
  const { id } = await props.params;
  const sp = await props.searchParams;
  const orderId = typeof sp.order_id === "string" ? sp.order_id : undefined;

  const ev = await Event.findById(id).lean<EventDoc>().catch(() => null);
  if (!ev) return notFound();

  const previewSrc = toDrivePreview(ev.link);

  return (
    <div className="book-page">
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>{ev.title}</h1>
          <Link href="/events" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
            ← Back
          </Link>
        </div>

        {/* If Cashfree redirected back with order_id, auto-confirm the registration */}
        {orderId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
              (async () => {
                try {
                  const r = await fetch('/api/events/${encodeURIComponent(
                    id
                  )}/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ orderId: ${JSON.stringify(orderId)} })
                  });
                  // Clean the URL even if confirm fails (avoid re-hitting on refresh)
                  const u = new URL(location.href);
                  u.searchParams.delete('order_id');
                  history.replaceState({}, '', u.toString());
                } catch (_) {}
              })();
            `,
            }}
          />
        )}

        <article
          className="card"
          style={{ color: "#111", background: "rgba(255,255,255,0.9)" }}
        >
          <div style={{ marginBottom: 10, fontWeight: 700 }}>
            {ev.startDate === ev.endDate
              ? `${fmtDate(ev.startDate)} • ${ev.startTime} – ${ev.endTime}`
              : `${fmtDate(ev.startDate)} → ${fmtDate(ev.endDate)} • ${ev.startTime} – ${ev.endTime}`}
          </div>

          {typeof ev.entryFee !== "undefined" && ev.entryFee !== null ? (
            <div style={{ marginBottom: 10, fontWeight: 800 }}>
              Entry Fee: ₹{Number(ev.entryFee)}
            </div>
          ) : (
            <div style={{ marginBottom: 10, fontWeight: 800 }}>Free Entry</div>
          )}

          {ev.description && <p style={{ marginTop: 0 }}>{ev.description}</p>}

          {/* Inline poster preview if it's a Drive link */}
          {previewSrc && (
            <div
              style={{
                marginTop: 12,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid rgba(0,0,0,0.12)",
              }}
            >
              <iframe
                src={previewSrc}
                width="100%"
                height="420"
                allow="autoplay"
                style={{ border: 0, display: "block" }}
              />
            </div>
          )}

          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <RegisterButton
              eventId={String(ev._id)}
              eventTitle={ev.title}
              entryFee={ev.entryFee}
              startDate={ev.startDate}
              startTime={ev.startTime}
            />
          </div>
        </article>
      </main>
    </div>
  );
}
