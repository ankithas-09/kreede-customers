"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CourtBoard from "@/components/CourtBoard";
import type { CourtSlot } from "@/components/CourtBoard";

type Selection = { courtId: number; start: string; end: string };

function encodeSelections(selections: Selection[]) {
  const s = JSON.stringify(selections);
  return typeof window === "undefined" ? "" : btoa(encodeURIComponent(s));
}

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "kreede:clientId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `client_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** build a Date from "YYYY-MM-DD" + "HH:MM" in the user's local timezone */
function toLocalDateTime(dateStr: string, timeHHMM: string) {
  // No timezone suffix => local time
  return new Date(`${dateStr}T${timeHHMM}:00`);
}

/** should the slot be disabled because it's past the current time (start < now)? */
function isPastStart(now: Date, dateStr: string, start: string) {
  const slotStart = toLocalDateTime(dateStr, start);
  return slotStart.getTime() < now.getTime();
}

export default function Page() {
  const router = useRouter();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Selection[]>([]);
  const [notice, setNotice] = useState<string>("");
  const [data, setData] = useState<{ date: string; courts: CourtSlot[][] } | null>(null);
  const [loading, setLoading] = useState(false);

  const clientIdRef = useRef<string>("");
  useEffect(() => {
    clientIdRef.current = getOrCreateClientId();
  }, []);

  // Poll availability (10s) including clientId so API can mark heldByMe
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchAvail = async () => {
      try {
        const res = await fetch(`/api/availability?date=${date}&clientId=${clientIdRef.current}`, {
          cache: "no-store",
        });
        const j = (await res.json()) as { date: string; courts: CourtSlot[][] };
        if (!alive) return;

        setData(j);

        // prune selections that became booked or held by others (past is handled visually)
        const blocked = new Set<string>();
        j.courts.flat().forEach((s: CourtSlot) => {
          if (s.status === "booked" || s.status === "held") {
            blocked.add(`${s.courtId}|${s.start}`);
          }
        });
        setSelected((prev) => prev.filter((p) => !blocked.has(`${p.courtId}|${p.start}`)));
      } catch {
        // no-op
      }
    };

    (async () => {
      setLoading(true);
      await fetchAvail();
      setLoading(false);
      const loop = async () => {
        await fetchAvail();
        timer = setTimeout(loop, 10_000);
      };
      void loop();
    })();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [date]);

  // Apply "past → disabled (grey)" overlay *except* for already-booked (red)
  const courts = useMemo(() => {
    if (!data) return [];
    const now = new Date(); // local time (browser)

    // Transform a deep copy to avoid mutating server data
    const copy: CourtSlot[][] = data.courts.map((court) =>
      court.map((s) => {
        // Keep booked RED no matter what
        if (s.status === "booked") return s;

        // If the slot start is in the past, mark disabled (grey)
        if (isPastStart(now, data.date, s.start)) {
          return { ...s, status: "disabled" as const };
        }

        // Otherwise keep the server-provided status (available/held/heldByMe)
        return s;
      })
    );

    return [
      { id: 1, title: "Court 1", data: copy[0] },
      { id: 2, title: "Court 2", data: copy[1] },
      { id: 3, title: "Court 3", data: copy[2] },
    ] as const;
  }, [data]);

  // Place a hold (kept for full TTL; no early release)
  const placeHold = async (s: Selection) => {
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, selections: [s], clientId: clientIdRef.current }),
      });
      const j = (await res.json()) as { results?: { ok?: boolean }[] };
      const ok = j?.results?.[0]?.ok;
      if (!ok) {
        setNotice("Someone is booking these slots");
        setTimeout(() => setNotice(""), 2500);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const toggle = async (s: Selection) => {
    const key = (x: Selection) => `${x.courtId}|${x.start}`;
    const isSelected = selected.some((p) => key(p) === key(s));

    if (isSelected) {
      // Just deselect locally; holds persist to TTL
      setSelected((prev) => prev.filter((p) => key(p) !== key(s)));
      return;
    }

    // Disallow picking past slots in case polling staleness still shows them
    if (isPastStart(new Date(), date, s.start)) {
      setNotice("This time has already passed");
      setTimeout(() => setNotice(""), 2000);
      return;
    }

    // allow if available or heldByMe
    const slot = data?.courts[s.courtId - 1]?.find((x) => x.start === s.start);
    if (!slot || (slot.status !== "available" && slot.status !== "heldByMe")) {
      setNotice("Someone is booking these slots");
      setTimeout(() => setNotice(""), 2500);
      return;
    }

    // If it's not already held by me, place a hold first
    if (slot.status === "available") {
      const ok = await placeHold(s);
      if (!ok) return;
    }

    setSelected((prev) => [...prev, s]);
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
              onChange={(e) => {
                setSelected([]); // clear local picks on date change
                setDate(e.target.value);
              }}
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
            <span><i className="dot dot-blue"></i> Selected / On hold (you)</span>
            <span><i className="dot dot-red"></i> Booked</span>
            <span><i className="dot dot-grey"></i> Disabled (past / on hold)</span>
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
              date={date}
              data={c.data}
              selected={selected}
              onToggleAction={toggle}
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
