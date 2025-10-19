"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const PLANS = [
  { id: "1M" as const, title: "1 Month",  games: 25,  amount: 2999,  subtitle: "25 games" },
  { id: "3M" as const, title: "3 Months", games: 75,  amount: 8999, subtitle: "75 games" },
  { id: "6M" as const, title: "6 Months", games: 150, amount: 17999, subtitle: "150 games" },
];

type MeUser = { id: string; userId: string; name?: string; email: string; phone?: string };

export default function MembershipClient() {
  const router = useRouter();
  const qp = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<"1M" | "3M" | "6M">("1M");
  const [user, setUser] = useState<MeUser | null>(null);

  const env = process.env.NEXT_PUBLIC_CASHFREE_ENV || "sandbox";

  // Load current user from cookie (no sessionStorage)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (!r.ok) {
          router.replace("/");
          return;
        }
        const j = await r.json();
        if (!j?.user) {
          router.replace("/");
          return;
        }
        setUser(j.user as MeUser);
      } catch {
        router.replace("/");
      }
    })();
    return () => { alive = false; };
  }, [router]);

  // If Cashfree redirected back with order_id, confirm and go home
  useEffect(() => {
    const orderId = qp.get("order_id");
    if (!orderId || !user?.id) return;

    (async () => {
      try {
        const res = await fetch("/api/memberships/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderId, user: { id: user.id } }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j?.message || "Confirm failed");
        router.replace("/home");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Payment confirmation failed.";
        alert(message);
        router.replace("/home");
      }
    })();
  }, [qp, router, user?.id]);

  const proceedToPay = async () => {
    if (!user) {
      alert("Please sign in again.");
      router.replace("/");
      return;
    }
    setLoading(true);
    try {
      // 1) Create CF order + pending membership
      const res = await fetch("/api/memberships/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: selected, user: { id: user.id, name: user.name, email: user.email } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to create order");

      // 2) Lazy import Cashfree SDK
      const { load } = await import("@cashfreepayments/cashfree-js");
      const cf = await load({ mode: env as "sandbox" | "production" });

      await cf.checkout({
        paymentSessionId: j.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Could not open checkout.";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="book-page">
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>Buy Membership</h1>
          <a className="btn" href="/home" style={{ background: "rgba(0,0,0,0.2)" }}>
            ← Home
          </a>
        </div>

        <div className="grid grid-3" style={{ gap: 16 }}>
          {PLANS.map((p) => {
            const isSel = selected === p.id;
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  background: isSel ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.04)",
                  border: isSel ? "2px solid var(--accent)" : "1px solid rgba(0,0,0,0.12)",
                  cursor: "pointer",
                }}
                onClick={() => setSelected(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(p.id)}
                aria-pressed={isSel}
                aria-label={`Select ${p.title} plan`}
              >
                <h2 style={{ margin: 0, fontWeight: 900, color: "#111" }}>{p.title}</h2>
                <p style={{ margin: "4px 0 10px 0", color: "#111", opacity: 0.8 }}>{p.subtitle}</p>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#111" }}>₹{p.amount}</div>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button
            className="btn"
            style={{ background: "var(--accent)" }}
            onClick={proceedToPay}
            disabled={loading || !user}
          >
            {loading ? "Opening Checkout…" : "Proceed to Pay"}
          </button>
        </div>
      </main>
    </div>
  );
}
