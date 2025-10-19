"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Membership = {
  _id: string;
  planId: "1M" | "3M" | "6M";
  planName: string;
  durationMonths: number;
  games: number;          // total
  gamesUsed: number;      // used
  remaining: number;      // computed in API
  percentUsed: number;    // computed in API
  amount: number;
  status: "PENDING" | "PAID" | "FAILED";
  createdAt: string;      // ISO
};

type MeUser = { id: string; userId: string; name?: string; email: string; phone?: string };

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function fmt(d: Date) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function MyMembershipPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [m, setM] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 1) Load current user from cookie via /api/auth/me
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

  // 2) Fetch active membership when user is known
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/memberships/active?userId=${encodeURIComponent(user.id)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json();
        if (!alive) return;
        if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to load membership");
        setM(j.membership || null);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Could not load membership.";
        setErr(message);
      } finally {
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [user?.id]);

  const created = m ? new Date(m.createdAt) : null;
  const expires = m && created ? addMonths(created, m.durationMonths) : null;

  return (
    <div className="book-page">
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>My Membership</h1>
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

        {!loading && !err && !m && (
          <div className="card" style={{ color: "#111" }}>
            You don&apos;t have an active membership.{" "}
            <Link href="/membership"><u>Buy one</u></Link>.
          </div>
        )}

        {m && (
          <section
            className="card"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(254,244,232,0.9))",
              border: "1px solid rgba(0,0,0,0.12)",
              color: "#111",
            }}
          >
            <header className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 14, opacity: 0.75 }}>Plan</div>
                <h2 style={{ margin: "4px 0 0 0", fontWeight: 900 }}>{m.planName}</h2>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, opacity: 0.75 }}>Status</div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    padding: "6px 8px",
                    borderRadius: 10,
                    background: m.status === "PAID" ? "rgba(34,197,94,0.2)" :
                               m.status === "PENDING" ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)",
                    color:      m.status === "PAID" ? "#166534" :
                               m.status === "PENDING" ? "#1e3a8a" : "#7f1d1d",
                  }}
                >
                  {m.status}
                </span>
              </div>
            </header>

            {/* Progress */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 6 }}>Usage</div>
              <div
                style={{
                  width: "100%",
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
                aria-label={`Games used: ${m.gamesUsed} of ${m.games}`}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, m.percentUsed))}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #3b82f6, #22c55e)",
                  }}
                />
              </div>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ fontSize: 13, opacity: 0.75 }}>Used: <b>{m.gamesUsed}</b></div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>Remaining: <b>{m.remaining}</b> / {m.games}</div>
              </div>
            </div>

            {/* Stats */}
            <div className="row" style={{ marginTop: 14, gap: 16 }}>
              <div className="card" style={{ flex: 1, background: "#fff" }}>
                <div style={{ fontSize: 14, opacity: 0.7 }}>Total Games</div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{m.games}</div>
              </div>
              <div className="card" style={{ flex: 1, background: "#fff" }}>
                <div style={{ fontSize: 14, opacity: 0.7 }}>Amount Paid</div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>₹{m.amount}</div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <div className="card" style={{ flex: 1, background: "#fff" }}>
                <div style={{ fontSize: 14, opacity: 0.7 }}>Started</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{created ? fmt(created) : "-"}</div>
              </div>
              <div className="card" style={{ flex: 1, background: "#fff" }}>
                <div style={{ fontSize: 14, opacity: 0.7 }}>Expires</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{expires ? fmt(expires) : "-"}</div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
