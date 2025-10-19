"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Selection = { courtId: number; start: string; end: string };
const PRICE_PER_SLOT = 500;

function decodeSelections(s: string | null): Selection[] {
  if (!s) return [];
  try {
    const json = decodeURIComponent(atob(s));
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as Selection[];
  } catch {}
  return [];
}

type ActiveMembership = {
  _id: string;
  planId: "1M" | "3M" | "6M";
  planName: string;
  games: number;
  gamesUsed: number;
  remaining: number;
  percentUsed: number;
};

type UserSession = { id: string; name?: string; email: string; phone?: string };

type PendingBooking = {
  date: string;
  selections: Selection[];
  amount: number; // actually charged amount
};

function getClientId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "kreede:clientId";
  const existing = localStorage.getItem(KEY);
  return existing || "";
}

async function releaseHolds(date: string, selections: Selection[]) {
  try {
    const clientId = getClientId();
    if (!clientId) return;
    await fetch("/api/holds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, clientId, selections }),
    });
  } catch {}
}

export default function CheckoutClient() {
  const router = useRouter();
  const qp = useSearchParams();

  const date = qp.get("date") || new Date().toISOString().slice(0, 10);
  const selections = useMemo(() => decodeSelections(qp.get("sel")), [qp]);

  const totalSlots = selections.length;
  const grossTotal = totalSlots * PRICE_PER_SLOT;

  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<ActiveMembership | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const env = process.env.NEXT_PUBLIC_CASHFREE_ENV || "sandbox";

  // 1) Load signed-in user from cookie via /api/auth/me (survives refresh)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (res.ok) {
          const j = await res.json();
          setUser(j?.user || null);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2) Load active membership (if any) once user is known
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/memberships/active?userId=${encodeURIComponent(user.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setMembership(j.membership || null);
      })
      .catch(() => {});
  }, [user?.id]);

  const remaining = membership?.remaining ?? 0;
  const freeCovered = Math.min(remaining, totalSlots);
  const payableSlots = Math.max(0, totalSlots - remaining);
  const toPayAmount = payableSlots * PRICE_PER_SLOT;

  // 3) On Cashfree redirect back → confirm booking & store in DB
  useEffect(() => {
    const orderId = qp.get("order_id");
    if (!orderId) return;

    const raw = typeof window !== "undefined" ? sessionStorage.getItem("kreede:pendingBooking") : null;
    const pending: PendingBooking | null = raw ? JSON.parse(raw) : null;

    if (!pending || !user) {
      router.replace("/home");
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/payments/cashfree/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            orderId,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
            date: pending.date,
            selections: pending.selections,
            amount: pending.amount,
            clientId: getClientId(), // ensure only the holder can finalize
          }),
        });
        await res.json().catch(() => ({}));
        // Clear holds on success (or even if server already processed)
        await releaseHolds(pending.date, pending.selections);
      } catch {
        // swallow and continue
      } finally {
        sessionStorage.removeItem("kreede:pendingBooking");
        setLoading(false);
        router.replace("/home");
      }
    })();
  }, [qp, router, user]);

  const freeBook = async () => {
    if (!selections.length || !user) {
      alert("Missing slot selection or user session");
      router.push("/");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/book/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user, date, selections, clientId: getClientId() }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "Could not book with membership.");
      // release the held slots now that booking is done
      await releaseHolds(date, selections);
      router.replace("/home");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Booking failed.";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const payNow = async () => {
    if (!selections.length || !user) {
      alert("Missing slot selection or user session");
      router.push("/");
      return;
    }
    setLoading(true);
    try {
      const chargeAmount = toPayAmount > 0 ? toPayAmount : grossTotal;

      // Stash booking for confirm after redirect
      const pending: PendingBooking = { date, selections, amount: chargeAmount };
      sessionStorage.setItem("kreede:pendingBooking", JSON.stringify(pending));

      // Create order
      const res = await fetch("/api/payments/cashfree/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: chargeAmount,
          currency: "INR",
          customer: {
            id: user.id,
            name: user.name || "Guest User",
            email: user.email,
            phone: user.phone || "9999999999",
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to create order");

      // Load CF SDK and open checkout
      const { load } = await import("@cashfreepayments/cashfree-js");
      const cashfree = await load({ mode: env as "sandbox" | "production" });

      await cashfree.checkout({
        paymentSessionId: j.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Payment failed.";
      alert(message);
      sessionStorage.removeItem("kreede:pendingBooking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="book-page">
      <main className="container">
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#111" }}>
          Checkout
        </h1>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ opacity: 0.7, fontSize: 14 }}>Date</div>
              <div style={{ fontWeight: 800 }}>{date}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ opacity: 0.7, fontSize: 14 }}>Price / Slot</div>
              <div style={{ fontWeight: 800 }}>₹{PRICE_PER_SLOT}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontWeight: 800, color: "#111" }}>Selected Slots</h2>
          {selections.length === 0 ? (
            <div>
              No slots selected.{" "}
              <a href="/book">
                <u>Go back</u>
              </a>
            </div>
          ) : (
            <>
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
                    <th style={th}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selections.map((s, i) => (
                    <tr key={i}>
                      <td style={td}>Court {s.courtId}</td>
                      <td style={td}>{s.start}</td>
                      <td style={td}>{s.end}</td>
                      <td style={td}>₹{PRICE_PER_SLOT}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ ...td, fontWeight: 800, textAlign: "right" }}>
                      Subtotal
                    </td>
                    <td style={{ ...td, fontWeight: 800 }}>₹{grossTotal}</td>
                  </tr>
                </tbody>
              </table>

              {membership && (
                <div style={{ marginTop: 10, color: "#111" }}>
                  <div style={{ fontWeight: 800 }}>
                    Membership: {membership.planName} • {membership.remaining} game(s) remaining
                  </div>
                  {freeCovered > 0 && (
                    <div style={{ opacity: 0.8, fontSize: 14 }}>
                      {freeCovered} slot(s) will be covered by membership.
                    </div>
                  )}
                  {payableSlots > 0 && (
                    <div style={{ opacity: 0.8, fontSize: 14 }}>
                      {payableSlots} slot(s) will be charged now: <b>₹{toPayAmount}</b>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <a href="/book" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
            ← Back
          </a>

          {membership && remaining >= totalSlots ? (
            <button
              className="btn"
              style={{ background: "var(--accent)" }}
              onClick={freeBook}
              disabled={!selections.length || loading || !user}
            >
              {loading
                ? "Booking…"
                : `Confirm (use ${totalSlots} membership game${totalSlots > 1 ? "s" : ""})`}
            </button>
          ) : (
            <button
              className="btn"
              style={{ background: "var(--accent)" }}
              onClick={payNow}
              disabled={!selections.length || loading || !user}
            >
              {loading
                ? "Opening Checkout…"
                : toPayAmount > 0
                ? `Pay ₹${toPayAmount}`
                : "Proceed to Pay"}
            </button>
          )}
        </div>
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
