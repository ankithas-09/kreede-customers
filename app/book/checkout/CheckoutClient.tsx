// app/book/checkout/CheckoutClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

type GuestInfo = { name: string; phone: string; email?: string; at?: number };

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

  // 🔢 Dynamic price for this checkout date
  const pricePerSlot = getPriceForDate(date);

  const totalSlots = selections.length;
  const grossTotal = totalSlots * pricePerSlot;

  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<ActiveMembership | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);

  // Gates so we don't accidentally show/trigger the pay flow before membership is known
  const [userReady, setUserReady] = useState(false);
  const [membershipReady, setMembershipReady] = useState(false);

  const env = process.env.NEXT_PUBLIC_CASHFREE_ENV || "sandbox";
  const isGuestMode = isGuestModeFromQP(qp) || !!getGuest();

  // 1) Load signed-in user (not for guests)
  useEffect(() => {
    if (isGuestMode) {
      setUserReady(true);
      setMembershipReady(true); // membership irrelevant for guests
      return;
    }
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
      } finally {
        if (alive) setUserReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isGuestMode]);

  // 2) Load active membership (only for signed-in users)
  useEffect(() => {
    if (isGuestMode || !user?.id) {
      setMembershipReady(true);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/memberships/active?userId=${encodeURIComponent(user.id)}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!alive) return;
        if (j?.ok) setMembership(j.membership || null);
      } catch {
      } finally {
        if (alive) setMembershipReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, isGuestMode]);

  const remaining = membership?.remaining ?? 0;
  const freeCovered = isGuestMode ? 0 : Math.min(remaining, totalSlots);
  const payableSlots = isGuestMode ? totalSlots : Math.max(0, totalSlots - remaining);
  const toPayAmount = payableSlots * pricePerSlot; // ← dynamic

  const canFreeBook = !isGuestMode && user && membership && remaining >= totalSlots;

  // 3) Handle Cashfree redirect → confirm booking & store in DB
  useEffect(() => {
    const orderId = qp.get("order_id");
    if (!orderId) return;

    // Wait until user+membership are ready, otherwise we may wrongly bail to pay/redirect
    if (!isGuestMode && (!userReady || !membershipReady)) return;

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
          const res = await fetch("/api/guest/payments/cashfree/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              guest,
              date: pending.date,
              selections: pending.selections,
              amount: pending.amount,
              clientId: getClientId(),
            }),
          });

          // Try to read bookingId to deep link; fall back to order_id
          let bookingId: string | undefined;
          try {
            const j = await res.json();
            if (j?.ok) bookingId = j.bookingId;
          } catch {
            // ignore JSON parse errors; we'll still redirect using orderId
          }

          await releaseHolds(pending.date, pending.selections);

          // ✅ Guest: redirect to receipt page
          sessionStorage.removeItem("kreede:pendingBooking");
          setLoading(false);
          if (bookingId) {
            router.replace(`/book/guest/confirmed?id=${encodeURIComponent(bookingId)}`);
          } else {
            router.replace(`/book/guest/confirmed?order_id=${encodeURIComponent(orderId)}`);
          }
          return;
        } else {
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

          sessionStorage.removeItem("kreede:pendingBooking");
          setLoading(false);
          router.replace("/home");
          return;
        }
      } catch {
      } finally {
        sessionStorage.removeItem("kreede:pendingBooking");
        setLoading(false);
      }
    })();
  }, [qp, router, user, isGuestMode, userReady, membershipReady]);

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
      // Charge only payable part (if membership covered some) using dynamic price
      const chargeAmount = toPayAmount > 0 ? toPayAmount : grossTotal;

      // For redirect confirmation
      const pending: PendingBooking = { date, selections, amount: chargeAmount };
      sessionStorage.setItem("kreede:pendingBooking", JSON.stringify(pending));

      let paymentSessionId = "";

      if (isGuestMode) {
        const guest = getGuest();
        if (!guest) throw new Error("Guest info missing.");
        const res = await fetch("/api/guest/payments/cashfree/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: chargeAmount,
            currency: "INR",
            guest,
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

      if (!paymentSessionId) throw new Error("Payment session ID missing from gateway.");

      const { load } = await import("@cashfreepayments/cashfree-js");
      const cashfree = await load({ mode: env as "sandbox" | "production" });

      await cashfree.checkout({
        paymentSessionId,
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

  // One smart button that calls the right path (free vs pay)
  const handlePrimary = async () => {
    if (!isGuestMode && (!userReady || !membershipReady)) return; // still loading
    if (canFreeBook) {
      await freeBook();
    } else {
      await payNow();
    }
  };

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

  const primaryDisabled =
    !selections.length ||
    loading ||
    (!isGuestMode && (!userReady || !membershipReady || !user));

  const primaryLabel = (() => {
    if (!isGuestMode && (!userReady || !membershipReady)) return "Checking membership…";
    if (canFreeBook) {
      const n = totalSlots;
      return `Confirm (use ${n} membership game${n > 1 ? "s" : ""})`;
    }
    if (isGuestMode) return `Pay ₹${grossTotal}`;
    return toPayAmount > 0 ? `Pay ₹${toPayAmount}` : "Proceed to Pay";
  })();

  return (
    <div className="book-page">
      <main className="container">
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#111" }}>
          Checkout
        </h1>

        {/* Price / Slot display uses the dynamic price */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ opacity: 0.7, fontSize: 14 }}>Date</div>
              <div style={{ fontWeight: 800 }}>{date}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ opacity: 0.7, fontSize: 14 }}>Price / Slot</div>
              <div style={{ fontWeight: 800 }}>₹{pricePerSlot}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontWeight: 800, color: "#111" }}>Selected Slots</h2>
          {selections.length === 0 ? (
            <div>
              No slots selected. <a href="/book"><u>Go back</u></a>
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
                      <td style={td}>₹{pricePerSlot}</td>
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

        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <a href="/book" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
              ← Back
            </a>

            <button
              className="btn"
              style={{ background: "var(--accent)" }}
              onClick={handlePrimary}
              disabled={primaryDisabled}
            >
              {loading ? (canFreeBook ? "Booking…" : "Opening Checkout…") : primaryLabel}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
