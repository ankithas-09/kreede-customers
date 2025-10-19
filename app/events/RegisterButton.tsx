// app/events/RegisterButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  eventId: string;
  eventTitle: string;
  entryFee?: number;   // 0 or undefined => free
  startDate: string;   // "YYYY-MM-DD"
  startTime?: string;  // "HH:mm" (optional)
  compact?: boolean;
};

function makeEventStart(startDate: string, startTime?: string) {
  // Build a local Date from YYYY-MM-DD + optional HH:mm
  const [y, m, d] = startDate.split("-").map(Number);
  let hh = 0, mm = 0;
  if (startTime) {
    const parts = startTime.split(":").map(Number);
    if (!Number.isNaN(parts[0])) hh = parts[0];
    if (!Number.isNaN(parts[1])) mm = parts[1];
  }
  return new Date(y, (m - 1), d, hh, mm, 0, 0);
}

export default function RegisterButton({
  eventId,
  eventTitle,
  entryFee = 0,
  startDate,
  startTime,
  compact
}: Props) {
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Compute cutoff (2 days before event start) once
  const cancelDisabled = useMemo(() => {
    const start = makeEventStart(startDate, startTime);
    const cutoff = new Date(start.getTime() - 2 * 24 * 60 * 60 * 1000);
    return new Date() > cutoff;
  }, [startDate, startTime]);

  // Check if already registered
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/registered`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!alive) return;
        if (r.ok) {
          const j = await r.json();
          setRegistered(!!j?.registered);
        }
      } catch {/* ignore */}
    })();
    return () => { alive = false; };
  }, [eventId]);

  const onRegister = async () => {
    setLoading(true);
    try {
      if (!entryFee || entryFee <= 0) {
        // Free event
        const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j?.error || "Registration failed");
        alert(`Registered for "${eventTitle}" successfully!`);
        setRegistered(true);
        return;
      }

      // Paid event
      const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: entryFee }),
      });
      const j = await r.json();
      if (!r.ok || !j.paymentSessionId) throw new Error(j?.error || "Failed to create order");

      const env = process.env.NEXT_PUBLIC_CASHFREE_ENV || "sandbox";
      const { load } = await import("@cashfreepayments/cashfree-js");
      const cf = await load({ mode: env as "sandbox" | "production" });
      await cf.checkout({
        paymentSessionId: j.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not register.";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const onCancel = async () => {
    // Extra guard (shouldn’t fire if disabled below)
    if (cancelDisabled) return;
    if (!confirm("Cancel your registration? A refund will be issued if applicable.")) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error || "Cancellation failed");
      alert("Registration cancelled.");
      setRegistered(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not cancel registration.";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" style={{ background: "rgba(0,0,0,0.2)" }} disabled>
          Registered
        </button>
        <button
          className="btn"
          style={{
            background: cancelDisabled ? "rgba(239,68,68,0.4)" : "rgba(239,68,68,0.9)",
            cursor: cancelDisabled ? "not-allowed" : "pointer",
            pointerEvents: cancelDisabled ? "none" : "auto", // <-- HARD disable click
          }}
          // Don’t attach onClick when disabled
          onClick={cancelDisabled ? undefined : onCancel}
          disabled={loading || cancelDisabled}
          title={cancelDisabled ? "Cancellation period is over (2 days before event)" : "Cancel Registration"}
          aria-disabled={cancelDisabled ? true : undefined}
        >
          {loading ? "Cancelling…" : "Cancel Registration"}
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn"
      style={{
        background: "var(--accent)",
        padding: compact ? "8px 10px" : undefined,
        borderRadius: 10,
      }}
      onClick={onRegister}
      disabled={loading}
      aria-label={`Register for ${eventTitle}`}
    >
      {loading ? "Please wait…" : entryFee && entryFee > 0 ? `Register • ₹${entryFee}` : "Register"}
    </button>
  );
}
