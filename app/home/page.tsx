// app/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MeUser = { id: string; userId: string; name?: string; email: string; phone?: string };
type ActiveMembership = {
  _id: string;
  planId: "1M" | "3M" | "6M";
  planName: string;
  durationMonths: number;
  games: number;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED";
  createdAt: string;
};
type EventItem = {
  _id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  entryFee?: number;
};

export default function HomeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [activeMembership, setActiveMembership] = useState<ActiveMembership | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const hasMembership = !!activeMembership;

  // Fetch user, membership, events
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // user
        const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (!r.ok) { router.replace("/"); return; }
        const j = await r.json();
        if (!j?.user) { router.replace("/"); return; }
        setUser(j.user as MeUser);

        // membership
        try {
          const mRes = await fetch(
            `/api/memberships/active?userId=${encodeURIComponent(j.user.id)}`,
            { cache: "no-store", credentials: "include" }
          );
          if (mRes.ok) {
            const m = await mRes.json();
            if (m?.ok && m?.membership) setActiveMembership(m.membership);
          }
        } catch {}

        // events sorted by date/time
        try {
          const eRes = await fetch("/api/events", { cache: "no-store" });
          if (eRes.ok) {
            const eJ = await eRes.json();
            if (eJ?.ok && Array.isArray(eJ.events)) {
              const sorted = eJ.events.sort((a: EventItem, b: EventItem) => {
                const ta = new Date(`${a.startDate}T${a.startTime || "00:00"}`).getTime();
                const tb = new Date(`${b.startDate}T${b.startTime || "00:00"}`).getTime();
                return ta - tb;
              });
              setEvents(sorted);
            }
          }
        } catch {}
      } catch {
        router.replace("/");
      }
    })();
    return () => { alive = false; };
  }, [router]);

  // close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const displayName = user?.name || user?.userId || "User";
  const go = (path: string) => router.push(path);
  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("kreede:user");
      sessionStorage.removeItem("kreede:pendingBooking");
    }
    setMenuOpen(false);
    router.replace("/");
  };

  const toRange = (ev: EventItem) => {
    const dateRange = ev.startDate === ev.endDate
      ? ev.startDate
      : `${ev.startDate} → ${ev.endDate}`;
    const timeRange = ev.startTime && ev.endTime ? ` • ${ev.startTime}–${ev.endTime}` : "";
    return `${dateRange}${timeRange}`;
  };

  return (
    <div className="hero">
      <div className="top-actions">
        <button className="action-button" onClick={() => go("/my-bookings")}>
          My Bookings
        </button>
        <div className="userbar" ref={menuRef}>
          <button
            className="menu-button"
            onClick={() => setMenuOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {displayName} ▾
          </button>
          {menuOpen && (
            <div className="menu-list" role="menu">
              <button className="menu-item" onClick={() => go("/profile")}>Profile</button>
              <button className="menu-item" onClick={() => go(hasMembership ? "/my-membership" : "/membership")}>
                {hasMembership ? "My Membership" : "Buy Membership"}
              </button>
              <button className="menu-item danger" onClick={logout}>Logout</button>
            </div>
          )}
        </div>
      </div>

      <main className="hero-center dashboard-mode">
        <div className="dashboard-grid">
          {/* BOOK CARD */}
          <div
            className="card card-cta"
            onClick={() => go("/book")}
            role="button"
            tabIndex={0}
          >
            <h2>BOOK YOUR COURT NOW</h2>
            <p>Reserve hourly slots on any court.</p>
          </div>

          {/* MEMBERSHIP CARD */}
          {hasMembership ? (
            <div
              className="card card-cta"
              onClick={() => go("/my-membership")}
              role="button"
              tabIndex={0}
            >
              <h2>MY MEMBERSHIP</h2>
              <p>{activeMembership?.planName} • {activeMembership?.games} games</p>
            </div>
          ) : (
            <div
              className="card card-cta"
              onClick={() => go("/membership")}
              role="button"
              tabIndex={0}
            >
              <h2>BUY MEMBERSHIP</h2>
              <p>Unlock discounts and exclusive perks.</p>
            </div>
          )}

          {/* EVENTS CARD WITH INLINE LIST */}
          <div className="card card-cta" role="button" tabIndex={0} onClick={() => go("/events")}>
            <h2>EVENTS AND ANNOUNCEMENTS</h2>
            <p>Join upcoming Events</p>

            {/* Events list rendered directly below */}
            {events.length > 0 && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 12,
                  width: "100%",
                }}
              >
                {events.map((ev) => (
                  <button
                    key={ev._id}
                    onClick={() => go(`/events/${ev._id}`)}
                    aria-label={`Open ${ev.title}`}
                    title={toRange(ev)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.12)",
                      color: "var(--fg)",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {ev.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
