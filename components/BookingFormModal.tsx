// components/BookingFormModal.tsx
"use client";
import { useMemo, useState } from "react";

type Selection = { courtId: number; start: string; end: string };

// ---- Dynamic pricing: weekdays ₹500, weekends ₹700 ----
function isWeekend(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}
function getPriceForDate(dateStr: string) {
  return isWeekend(dateStr) ? 700 : 500;
}

type Props = {
  open: boolean;
  date: string;
  selections: Selection[];
  /** Optional override; if omitted we compute from date */
  pricePerSlot?: number;
  onCloseAction: () => void;
  onSuccessAction: () => void; // refetch after success
};

export default function BookingFormModal({
  open,
  date,
  selections,
  pricePerSlot,
  onCloseAction,
  onSuccessAction,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Compute dynamic price if not provided explicitly
  const unitPrice = useMemo(
    () => (pricePerSlot ?? getPriceForDate(date)),
    [pricePerSlot, date]
  );

  const total = useMemo(
    () => selections.length * unitPrice,
    [selections, unitPrice]
  );

  const submit = async () => {
    setSubmitting(true);
    setError("");

    const payload = {
      name,
      email,
      phone,
      date,
      selections: selections.map((s) => ({
        courtId: s.courtId,
        startTime: s.start,
        endTime: s.end,
      })),
    };

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        const conflicts = j?.error || "";
        setError(conflicts || "Booking failed");
      } else {
        onSuccessAction();
        onCloseAction();
        setName("");
        setEmail("");
        setPhone("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div style={backdrop} role="dialog" aria-modal="true">
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Confirm your booking</h3>
          <button
            className="btn"
            style={{ background: "rgba(255,255,255,0.2)" }}
            onClick={onCloseAction}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <div style={{ opacity: 0.8, fontSize: 14 }}>Date</div>
            <div style={{ fontWeight: 700 }}>{date}</div>
          </div>

          <div>
            <div style={{ opacity: 0.8, fontSize: 14 }}>Selected Slots</div>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {selections.map((s, i) => (
                <li key={i}>
                  Court {s.courtId} — {s.start}–{s.end}
                </li>
              ))}
            </ul>
          </div>

          <label>
            <div style={{ marginBottom: 4 }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={input}
              placeholder="Your full name"
            />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
              placeholder="you@example.com"
            />
          </label>
          <label>
            <div style={{ marginBottom: 4 }}>Contact Number</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={input}
              placeholder="+91 XXXXX XXXXX"
            />
          </label>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <div style={{ opacity: 0.8 }}>Total (₹{unitPrice}/slot)</div>
            <div style={{ fontWeight: 800 }}>₹ {total}</div>
          </div>

          {error && <div style={{ color: "#ef4444", fontSize: 14 }}>{error}</div>}

          <button
            className="btn"
            onClick={submit}
            disabled={submitting || selections.length === 0 || !name || !email || !phone}
            style={{ background: "var(--accent)", marginTop: 4 }}
          >
            {submitting ? "Processing…" : "Pay & Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
  padding: 16,
};
const modal: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 16,
  padding: 16,
  width: "100%",
  maxWidth: 520,
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  color: "var(--fg)",
};
