// app/my-bookings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SlotItem = { courtId: number; start: string; end: string };

type Booking = {
  _id: string;
  orderId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  date: string;             // YYYY-MM-DD
  slots: SlotItem[];        // [{courtId,start,end}, ...]
  amount: number;           // total paid for the whole order
  currency: "INR";
  status: "PAID" | "PENDING" | "FAILED";
  paymentRef?: string;      // "MEMBERSHIP" for free bookings
  createdAt: string;
  paymentRaw?: unknown;
};

type MeUser = { id: string; userId?: string; name?: string; email: string; phone?: string };

type DisplayItem = {
  key: string;
  bookingId: string;
  orderId: string;
  slotIndex: number;
  date: string;      // YYYY-MM-DD
  courtId: number;
  start: string;     // HH:mm
  end: string;       // HH:mm
  amount: number;    // per-slot amount
  status: "PAID" | "PENDING" | "FAILED";
  paymentRef?: string;
};

function perSlotAmount(total: number, slotsCount: number) {
  if (slotsCount <= 0) return 0;
  return Math.round((total / slotsCount) * 100) / 100;
}

/** Trim & normalize "6:0" -> "06:00" */
function normalizeHHmm(val?: string): string | null {
  if (!val) return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const hh2 = hh.toString().padStart(2, "0");
  const mm2 = mm.toString().padStart(2, "0");
  return `${hh2}:${mm2}`;
}

/** Build a local Date from date(YYYY-MM-DD) and time(HH:mm) */
function toLocalDateTime(dateISO: string, timeHHmm: string): Date | null {
  const date = String(dateISO || "").trim();
  const t = normalizeHHmm(timeHHmm || "");
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm || !t) return null;
  const [, ys, ms, ds] = dm;
  const [hh, mm] = t.split(":").map(Number);
  // months are 0-based
  return new Date(Number(ys), Number(ms) - 1, Number(ds), hh, mm, 0, 0);
}

/** Can cancel if now < (slotStart - 2h); if we can't parse safely, don't block in UI. */
function isCancelable(dateISO: string, startHHmm: string, now = new Date()) {
  const start = toLocalDateTime(dateISO, startHHmm);
  if (!start || isNaN(start.getTime())) return true; // be permissive in UI; server will enforce
  const cutoff = new Date(start.getTime() - 2 * 60 * 60 * 1000);
  return now.getTime() < cutoff.getTime();
}

export default function MyBookingsPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyKey, setBusyKey] = useState<string>("");

  // ticking "now" so the buttons update without reload
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000); // every minute
    return () => clearInterval(id);
  }, []);

  // current user from cookie
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (!r.ok) {
          setErr("Please sign in again.");
          setLoading(false);
          return;
        }
        const j = await r.json();
        if (!j?.user) {
          setErr("Please sign in again.");
          setLoading(false);
          return;
        }
        setUser(j.user as MeUser);
      } catch {
        setErr("Unable to verify session. Please sign in again.");
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // bookings for this user (by userId OR email fallback)
  const loadBookings = async (uid: string, email?: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (uid) qs.set("userId", uid);
      if (email) qs.set("email", email);
      const res = await fetch(`/api/bookings?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j: { ok?: boolean; error?: string; bookings?: Booking[] } = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "Failed to load bookings");
      setBookings(j.bookings || []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not load bookings.";
      setErr(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) loadBookings(user.id, user.email);
  }, [user?.id, user?.email]);

  // flatten each slot into one card
  const items: DisplayItem[] = useMemo(() => {
    const out: DisplayItem[] = [];
    for (const b of bookings) {
      const per = perSlotAmount(b.amount, b.slots.length || 1);
      b.slots.forEach((s, idx) => {
        out.push({
          key: `${b._id}_${idx}`,
          bookingId: b._id,
          orderId: b.orderId,
          slotIndex: idx,
          date: String(b.date || "").trim(),
          courtId: s.courtId,
          start: String(s.start || "").trim(),
          end: String(s.end || "").trim(),
          amount: per,
          status: b.status,
          paymentRef: b.paymentRef,
        });
      });
    }
    // newest first
    return out.reverse();
  }, [bookings]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-GB");

  const cancelSlot = async (it: DisplayItem) => {
    // UI guard (server also enforces)
    const normStart = normalizeHHmm(it.start);
    if (normStart && !isCancelable(it.date, normStart, now)) {
      alert("Cancellation window has closed (you can cancel until 2 hours before the slot).");
      return;
    }
    if (!confirm("Cancel this booking slot? Refund will be processed if applicable.")) return;

    setBusyKey(it.key);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bookingId: it.bookingId,
          slotIndex: it.slotIndex,
        }),
      });
      const j: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "Cancellation failed.");
      // refresh list
      if (user?.id) await loadBookings(user.id, user.email);
      alert("Booking cancelled successfully.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not cancel booking.";
      alert(message);
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="book-page">
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>My Bookings</h1>
          <Link href="/home" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
            ← Home
          </Link>
        </div>

        {loading && <div className="card" style={{ color: "#111" }}>Loading…</div>}

        {!!err && !loading && (
          <div className="card" style={{ color: "#111", borderColor: "rgba(239,68,68,0.35)" }}>
            {err}
          </div>
        )}

        {!loading && !err && items.length === 0 && (
          <div className="card" style={{ color: "#111" }}>
            You have no bookings yet. <Link href="/book"><u>Book a court</u></Link>.
          </div>
        )}

        <div className="grid" style={{ gap: 16 }}>
          {items.map((it) => {
            const normStart = normalizeHHmm(it.start);       // makes "6:0" -> "06:00"
            const canCancel = normStart ? isCancelable(it.date, normStart, now) : true;

            // show cutoff if we can compute it; otherwise omit (don’t block)
            const startDT = normStart ? toLocalDateTime(it.date, normStart) : null;
            const cutoff = startDT ? new Date(startDT.getTime() - 2 * 60 * 60 * 1000) : null;
            const cutoffLabel =
              cutoff
                ? `${cutoff.toLocaleDateString("en-GB")} ${cutoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : null;

            return (
              <article key={it.key} className="card" style={{ background: "rgba(255,255,255,0.9)" }}>
                <header className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ color: "#111" }}>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>Date</div>
                    <div style={{ fontWeight: 800 }}>{formatDate(it.date)}</div>
                  </div>
                  <div style={{ textAlign: "right", color: "#111" }}>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>Amount</div>
                    <div style={{ fontWeight: 800 }}>₹{it.amount}</div>
                  </div>
                </header>

                <div style={{ marginTop: 10, color: "#111" }}>
                  <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 6 }}>Court & Timing</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li style={{ lineHeight: 1.6 }}>
                      Court {it.courtId}: {normStart ?? it.start} – {it.end}
                    </li>
                  </ul>
                </div>

                <footer className="row" style={{ justifyContent: "space-between", marginTop: 10, color: "#111" }}>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>Order: {it.orderId}</div>
                    {!canCancel && cutoffLabel && (
                      <div style={{ fontSize: 12, opacity: 0.85 }}>
                        Cancellation closed (cutoff: {cutoffLabel})
                      </div>
                    )}
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        padding: "6px 8px",
                        borderRadius: 10,
                        background:
                          it.status === "PAID" ? "rgba(34,197,94,0.2)" :
                          it.status === "PENDING" ? "rgba(59,130,246,0.2)" :
                          "rgba(239,68,68,0.2)",
                        color:
                          it.status === "PAID" ? "#166534" :
                          it.status === "PENDING" ? "#1e3a8a" : "#7f1d1d",
                      }}
                    >
                      {it.status}
                    </span>

                    <button
                      className="btn"
                      style={{
                        background: canCancel ? "rgba(239,68,68,0.9)" : "rgba(0,0,0,0.2)",
                        cursor: canCancel ? "pointer" : "not-allowed",
                      }}
                      onClick={() => canCancel && cancelSlot(it)}
                      disabled={busyKey === it.key || !canCancel}
                      aria-label="Cancel this slot"
                      title={canCancel ? "Cancel this booking" : "Cancellation window closed"}
                    >
                      {busyKey === it.key ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
