"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CourtBoard from "@/components/CourtBoard";
import type { CourtSlot } from "@/components/CourtBoard";

type Selection = { courtId: number; start: string; end: string };

function encodeSelections(selections: Selection[]) {
  const s = JSON.stringify(selections);
  return typeof window === "undefined" ? "" : btoa(encodeURIComponent(s));
}

export default function Page() {
  const router = useRouter();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Selection[]>([]);
  const [notice] = useState<string>(""); // setter unused; keep read-only state
  const [data, setData] = useState<{ date: string; courts: CourtSlot[][] } | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-tick every minute so past slots grey out
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?date=${date}`);
      const j = await res.json();
      setData(j);
      setSelected([]); // clear selection on refresh
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchAvailability();
  }, [date, tick, fetchAvailability]);

  const courts = useMemo(() => {
    if (!data) return [];
    return [
      { id: 1, title: "Court 1", data: data.courts[0] },
      { id: 2, title: "Court 2", data: data.courts[1] },
      { id: 3, title: "Court 3", data: data.courts[2] },
    ] as const;
  }, [data]);

  const toggle = (s: Selection) => {
    setSelected((prev) => {
      const exists = prev.some((p) => p.courtId === s.courtId && p.start === s.start);
      return exists ? prev.filter((p) => !(p.courtId === s.courtId && p.start === s.start)) : [...prev, s];
    });
  };

  const goToCheckout = () => {
    const sel = encodeSelections(selected);
    router.push(`/book/checkout?date=${date}&sel=${sel}`);
  };

  return (
    <div className="book-page">
      <main className="container">
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#111" }}>
          Court Booking
        </h1>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <label htmlFor="date" style={{ opacity: 0.9, color: "#111" }}>Date</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                background: "#fff",
                color: "#111",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            />
          </div>
          <div className="legend" style={{ color: "#111" }}>
            <span><i className="dot dot-green"></i> Available</span>
            <span><i className="dot dot-blue"></i> Selected</span>
            <span><i className="dot dot-red"></i> Booked</span>
            <span><i className="dot dot-grey"></i> Disabled</span>
          </div>
        </div>

        {loading && (
          <div style={{ marginTop: 8, opacity: 0.8, fontSize: 14, color: "#111" }}>
            Loading availability…
          </div>
        )}

        <div className="grid grid-3" style={{ marginTop: 16 }}>
          {courts.map((c) => (
            <CourtBoard
              key={c.id}
              title={c.title}
              data={c.data}
              selected={selected}
              onToggle={toggle}
            />
          ))}
        </div>

        <div className="sticky-bar light">
          <div className="row" style={{ justifyContent: "space-between", color: "#111" }}>
            <div style={{ opacity: 0.85 }}>
              {selected.length ? `${selected.length} slot(s) selected` : "No slots selected"}
            </div>
            <button
              className="btn"
              style={{ background: selected.length ? "var(--accent)" : "rgba(0,0,0,0.2)" }}
              onClick={goToCheckout}
              disabled={selected.length === 0}
            >
              {selected.length ? `Proceed to Checkout (${selected.length})` : "Proceed to Checkout"}
            </button>
          </div>
          {notice && (
            <div style={{ marginTop: 8, fontSize: 14, opacity: 0.85, color: "#111" }}>
              {notice}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
