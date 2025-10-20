// app/book/guest/confirmed/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Slot = { courtId: number; start: string; end: string };
type GuestBooking = {
  _id: string;
  orderId: string;
  userName?: string;
  userEmail?: string;
  date: string;
  slots: Slot[];
  amount: number;
  currency: "INR";
  status: "PAID" | "PENDING" | "FAILED";
  paymentRef?: string;
  createdAt: string;
  updatedAt: string;
};

export default function GuestConfirmedPage() {
  const qp = useSearchParams();
  const router = useRouter();

  const orderId = qp.get("order_id") || "";
  const id = qp.get("id") || "";

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [error, setError] = useState("");

  const identifier = useMemo(() => {
    if (orderId) return { kind: "orderId" as const, value: orderId };
    if (id) return { kind: "id" as const, value: id };
    return null;
  }, [orderId, id]);

  useEffect(() => {
    if (!identifier) {
      setError("Missing booking identifier.");
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const url =
          identifier.kind === "orderId"
            ? `/api/guest/bookings?orderId=${encodeURIComponent(identifier.value)}`
            : `/api/guest/bookings?id=${encodeURIComponent(identifier.value)}`;
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        if (res.ok && j?.ok) {
          setBooking(j.booking);
        } else {
          setError(j?.error || "Could not load booking.");
        }
      } catch {
        if (alive) setError("Network error.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [identifier]);

  const totalSlots = booking?.slots?.length || 0;

  return (
    <div className="book-page">
      <main className="container">
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#111" }}>
          Booking Confirmed
        </h1>

        {loading ? (
          <div className="card" style={{ color: "#111" }}>Loading booking…</div>
        ) : error ? (
          <div
            className="card"
            style={{
              color: "#991b1b",
              borderColor: "rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : booking ? (
          <>
            <div className="card" style={{ marginBottom: 16, color: "#111" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 14 }}>Order ID</div>
                  <div style={{ fontWeight: 800 }}>{booking.orderId}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ opacity: 0.7, fontSize: 14 }}>Status</div>
                  <div style={{ fontWeight: 800 }}>
                    {booking.status === "PAID" ? "✅ PAID" : booking.status}
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16, color: "#111" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 14 }}>Guest</div>
                  <div style={{ fontWeight: 800 }}>
                    {booking.userName || "Guest"}{" "}
                    {booking.userEmail ? (
                      <span style={{ opacity: 0.7, fontWeight: 400 }}>• {booking.userEmail}</span>
                    ) : null}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ opacity: 0.7, fontSize: 14 }}>Date</div>
                  <div style={{ fontWeight: 800 }}>{booking.date}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16, color: "#111" }}>
              <h2 style={{ marginTop: 0, fontWeight: 800, color: "#111" }}>
                Slots ({totalSlots})
              </h2>
              {totalSlots === 0 ? (
                <div>No slots found.</div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    color: "#111",
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={th}>Court</th>
                      <th style={th}>Start</th>
                      <th style={th}>End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.slots.map((s, i) => (
                      <tr key={i}>
                        <td style={td}>Court {s.courtId}</td>
                        <td style={td}>{s.start}</td>
                        <td style={td}>{s.end}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card" style={{ marginBottom: 16, color: "#111" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ opacity: 0.7, fontSize: 14 }}>Total Paid</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  ₹{booking.amount} {booking.currency}
                </div>
              </div>
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <a href="/home" className="btn" style={{ background: "var(--accent)" }}>
                Go to Home →
              </a>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid rgba(0,0,0,0.12)",
  fontWeight: 800,
};
const td: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};
