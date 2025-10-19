// app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MeUser = { id: string; userId: string; name?: string; email: string; phone?: string; dob?: string };

type UserDoc = {
  _id: string;
  userId: string;
  name?: string;
  email: string;
  phone?: string;
  dob?: string;
  createdAt?: string;
};

type ActiveMembership = {
  _id: string;
  planId: "1M" | "3M" | "6M";
  planName: string;
  durationMonths: number;
  games: number;
  gamesUsed: number;
  remaining: number;
  percentUsed: number;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED";
  createdAt: string;
};

function fmtDate(d?: string) {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ProfilePage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [mem, setMem] = useState<ActiveMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // phone editing state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // 1) Read current session user from cookie via /api/auth/me
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (!r.ok) throw new Error("Not signed in");
        const j = await r.json();
        if (!j?.user) throw new Error("Not signed in");
        setMe(j.user as MeUser);
      } catch {
        setErr("Please sign in again.");
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2) Load user doc + active membership
  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    (async () => {
      try {
        // user doc
        const uRes = await fetch(`/api/users/${encodeURIComponent(me.id)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const uj = await uRes.json();
        if (!alive) return;
        if (!uRes.ok || !uj?.ok) throw new Error(uj?.error || "Failed to load user");
        setUser(uj.user);
        setPhoneInput(uj.user?.phone || "");

        // membership (optional)
        const mRes = await fetch(`/api/memberships/active?userId=${encodeURIComponent(me.id)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const mj = await mRes.json();
        if (!alive) return;
        if (mRes.ok && mj?.ok) setMem(mj.membership || null);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load profile.";
        setErr(message);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me?.id]);

  const onSavePhone = async () => {
    if (!user?._id) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phoneInput }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Update failed");
      setUser(j.user);
      setEditingPhone(false);
      setSaveMsg("Phone updated successfully.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not update phone.";
      setSaveMsg(message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 2500);
    }
  };

  return (
    <div className="book-page">
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>Profile</h1>
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

        {!loading && !err && user && (
          <section className="card" style={{ color: "#111", marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontWeight: 900 }}>Account</h2>

            <div className="grid" style={{ gap: 10 }}>
              <div>
                <b>UserID:</b> {user.userId}
              </div>
              <div>
                <b>Name:</b> {user.name || "-"}
              </div>
              <div>
                <b>Email:</b> {user.email}
              </div>

              {/* Contact (editable) */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontWeight: 700 }}>Contact</label>
                {editingPhone ? (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <input
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+91 XXXXX XXXXX"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.15)",
                        background: "#fff",
                        color: "#111",
                        minWidth: 220,
                      }}
                    />
                    <button
                      className="btn"
                      style={{ background: "var(--accent)" }}
                      onClick={onSavePhone}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="btn"
                      style={{ background: "rgba(0,0,0,0.2)" }}
                      onClick={() => {
                        setEditingPhone(false);
                        setPhoneInput(user.phone || "");
                        setSaveMsg("");
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <div>{user.phone || "-"}</div>
                    <button
                      className="btn"
                      style={{ background: "rgba(0,0,0,0.2)" }}
                      onClick={() => setEditingPhone(true)}
                    >
                      Edit
                    </button>
                  </div>
                )}
                {saveMsg && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>{saveMsg}</div>}
              </div>

              <div>
                <b>DOB:</b> {fmtDate(user.dob)}
              </div>
              <div>
                <b>Joined:</b> {fmtDate(user.createdAt)}
              </div>
            </div>
          </section>
        )}

        {!loading && !err && (
          <section
            className="card"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(254,244,232,0.9))",
              border: "1px solid rgba(0,0,0,0.12)",
              color: "#111",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontWeight: 900 }}>{mem ? "Membership" : "No Membership"}</h2>
              {!mem && (
                <Link href="/membership" className="btn" style={{ background: "var(--accent)" }}>
                  Buy Membership
                </Link>
              )}
            </div>

            {mem && (
              <>
                <div className="row" style={{ marginTop: 10, gap: 16 }}>
                  <div className="card" style={{ flex: 1, background: "#fff" }}>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>Plan</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{mem.planName}</div>
                  </div>
                  <div className="card" style={{ flex: 1, background: "#fff" }}>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>Total Games</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{mem.games}</div>
                  </div>
                  <div className="card" style={{ flex: 1, background: "#fff" }}>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>Remaining</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{mem.remaining}</div>
                  </div>
                </div>

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
                    aria-label={`Games used: ${mem.gamesUsed} of ${mem.games}`}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, mem.percentUsed))}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #3b82f6, #22c55e)",
                      }}
                    />
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      Used: <b>{mem.gamesUsed}</b>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      Remaining: <b>{mem.remaining}</b> / {mem.games}
                    </div>
                  </div>
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <Link href="/my-membership" className="btn" style={{ background: "rgba(0,0,0,0.2)" }}>
                    View Membership →
                  </Link>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
