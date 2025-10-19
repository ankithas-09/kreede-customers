// app/book/checkout/CheckoutClient.tsx
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
  amount: number;
};

type GuestInfo = { name: string; phone: string; at?: number };

function getClientId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "kreede:clientId";
  const existing = localStorage.getItem(KEY);
  return existing || "";
}

function getGuest(): GuestInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("kreede:guest");
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as GuestInfo;
    if (obj && obj.name && obj.phone) return obj;
  } catch {}
  return null;
}

function isGuestModeFromQP(qp: URLSearchParams): boolean {
  return qp.get("guest") === "1";
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

// Safe JSON parse helper (handles HTML error pages gracefully)
async function parseJsonSafe<T = unknown>(
  res: Response
): Promise<{ ok: boolean; data?: T; text: string }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data, text };
  } catch {
    return { ok: false, text };
  }
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
  const [guestConfirmed, setGuestConfirmed] = useState(false); // ✅ show success banner for guests

  const env = process.env.NEXT_PUBLIC_CASHFREE_ENV || "sandbox";
  const isGuestMode = isGuestModeFromQP(qp) || !!getGuest();

  // 1) Load signed-in user (members only). Guests don't need it.
  useEffect(() => {
    if (isGuestMode) return;
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
  }, [isGuestMode]);

  // 2) Load active membership (members only)
  useEffect(() => {
    if (isGuestMode || !user?.id) return;
    fetch(`/api/memberships/active?userId=${encodeURIComponent(user.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setMembership(j.membership || null);
      })
      .catch(() => {});
  }, [user?.id, isGuestMode]);

  const remaining = membership?.remaining ?? 0;
  const freeCovered = isGuestMode ? 0 : Math.min(remaining, totalSlots);
  const payableSlots = isGuestMode ? totalSlots : Math.max(0, totalSlots - remaining);
  const toPayAmount = payableSlots * PRICE_PER_SLOT;

  // 3) Handle Cashfree redirect → confirm booking & store in DB
  useEffect(() => {
    const orderId = qp.get("order_id");
    if (!orderId) return;

    const raw =
      typeof window !== "undefined" ? sessionStorage.getItem("kreede:pendingBooking") : null;
    const pending: PendingBooking | null = raw ? JSON.parse(raw) : null;

    if (!pending) {
      router.replace("/home");
      return;
    }

    (async () => {
      setLoading(true);
      try {
        if (isGuestMode) {
          const guest = getGuest();
          if (!guest) {
            router.replace("/");
            return;
          }
          // Guest booking confirm
          const res = await fetch("/api/guest/payments/cashfree/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              guest, // { name, phone }
              date: pending.date,
              selections: pending.selections,
              amount: pending.amount,
              clientId: getClientId(),
            }),
          });
          await res.text().catch(() => {});
          await releaseHolds(pending.date, pending.selections);

          // ✅ Show "Booking Confirmed" for guests, then redirect
          setGuestConfirmed(true);
          sessionStorage.removeItem("kreede:pendingBooking");
          setLoading(false);
          setTimeout(() => router.replace("/home"), 2000);
          return; // IMPORTANT: stop here (don’t run the finally redirect below)
        } else {
          // Member booking confirm
          if (!user) {
            router.replace("/");
            return;
          }
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
              clientId: getClientId(),
            }),
          });
          await res.text().catch(() => {});
          await releaseHolds(pending.date, pending.selections);

          // Members: go home immediately
          sessionStorage.removeItem("kreede:pendingBooking");
          setLoading(false);
          router.replace("/home");
          return;
        }
      } catch {
        // swallow and continue
      } finally {
        // Fallback cleanup in case we didn't early-return above
        sessionStorage.removeItem("kreede:pendingBooking");
        setLoading(false);
      }
    })();
  }, [qp, router, user, isGuestMode]);

  const freeBook = async () => {
    if (isGuestMode) return;
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
    if (!selections.length) {
      alert("No slots selected.");
      return;
    }
    if (!isGuestMode && !user) {
      alert("Please sign in again.");
      router.push("/");
      return;
    }

    setLoading(true);
    try {
      const chargeAmount = toPayAmount > 0 ? toPayAmount : grossTotal;

      // Stash booking for confirm after redirect
      const pending: PendingBooking = { date, selections, amount: chargeAmount };
      sessionStorage.setItem("kreede:pendingBooking", JSON.stringify(pending));

      // Create order and extract a DEFINITE string paymentSessionId
      let paymentSessionId: string = "";

      if (isGuestMode) {
        const guest = getGuest();
        if (!guest) throw new Error("Guest info missing.");
        const res = await fetch("/api/guest/payments/cashfree/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: chargeAmount,
            currency: "INR",
            guest, // { name, phone }
          }),
        });
        const parsed = await parseJsonSafe<{
          paymentSessionId?: unknown;
          payment_session_id?: unknown;
          error?: string;
        }>(res);
        if (!res.ok || !parsed.ok || !parsed.data) {
          const msg =
            (parsed.data && (parsed.data as { error?: string }).error) ||
            `Failed to create order (guest) [${res.status}]`;
          throw new Error(msg);
        }
        const d = parsed.data;
        const maybe =
          (d.paymentSessionId as string | undefined) ??
          (d.payment_session_id as string | undefined);
        paymentSessionId = typeof maybe === "string" ? maybe : "";
      } else {
        // Member flow
        const res = await fetch("/api/payments/cashfree/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            amount: chargeAmount,
            currency: "INR",
            customer: {
              id: user!.id,
              name: user!.name || "Member",
              email: user!.email,
              phone: user!.phone || "9999999999",
            },
          }),
        });
        const parsed = await parseJsonSafe<{
          paymentSessionId?: unknown;
          payment_session_id?: unknown;
          error?: string;
        }>(res);
        if (!res.ok || !parsed.ok || !parsed.data) {
          const msg =
            (parsed.data && (parsed.data as { error?: string }).error) ||
            `Failed to create order [${res.status}]`;
          throw new Error(msg);
        }
        const d = parsed.data;
        const maybe =
          (d.paymentSessionId as string | undefined) ??
          (d.payment_session_id as string | undefined);
        paymentSessionId = typeof maybe === "string" ? maybe : "";
      }

      if (!paymentSessionId) {
        throw new Error("Payment session ID missing from gateway.");
      }

      // Load CF SDK and open checkout
      const { load } = await import("@cashfreepayments/cashfree-js");
      const cashfree = await load({ mode: env as "sandbox" | "production" });

      await cashfree.checkout({
        paymentSessionId, // definitely a string
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

        {/* ✅ Guest success banner */}
        {guestConfirmed && (
          <div
            className="card"
            style={{
              marginBottom: 16,
              borderColor: "rgba(34,197,94,0.35)",
              background: "rgba(34,197,94,0.08)",
              color: "#065f46",
              fontWeight: 800,
            }}
          >
            ✅ Booking Confirmed! Redirecting to home…
          </div>
        )}

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

              {!isGuestMode && membership && (
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

              {isGuestMode && (
                <div style={{ marginTop: 10, color: "#111" }}>
                  <div style={{ fontWeight: 800 }}>
                    Guest checkout • You’ll be charged now: ₹{grossTotal}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <a href="/book" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
            ← Back
          </a>

          {!isGuestMode && membership && remaining >= totalSlots ? (
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
              disabled={!selections.length || loading || (!isGuestMode && !user)}
            >
              {loading
                ? "Opening Checkout…"
                : isGuestMode
                ? `Pay ₹${grossTotal}`
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
