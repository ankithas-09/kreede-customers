"use client";

import SlotButton from "./SlotButton";

export type CourtSlot = {
  courtId: number;
  start: string;
  end: string;
  status: "available" | "booked" | "disabled" | "held" | "heldByMe";
};

type Selection = { courtId: number; start: string; end: string };

type Props = {
  title: string;
  date: string; // ← NEW: used to determine past slots
  data: CourtSlot[];
  selected: Selection[];
  onToggleAction: (s: Selection) => void;
};

// Local helpers to evaluate “past start”
function toLocalDateTime(dateStr: string, timeHHMM: string) {
  // Interprets as local time (no timezone suffix)
  return new Date(`${dateStr}T${timeHHMM}:00`);
}
function isPastStart(now: Date, dateStr: string, start: string) {
  return toLocalDateTime(dateStr, start).getTime() < now.getTime();
}

export default function CourtBoard({ title, date, data, selected, onToggleAction }: Props) {
  const now = new Date();

  return (
    <div className="card">
      <h2 style={{ fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <div className="grid grid-2">
        {data.map((s) => {
          const isSelected = selected.some(
            (x) => x.courtId === s.courtId && x.start === s.start
          );

          // NEW: past-start slots become grey (unless already booked)
          const past = isPastStart(now, date, s.start);

          // Blocked for others: booked, disabled, held (by others), or past-start
          const isBlocked =
            s.status === "booked" || s.status === "disabled" || s.status === "held" || past;

          // Visual mapping:
          // - booked -> "booked" (red)
          // - held (others) OR past-start -> "disabled" (grey)
          // - heldByMe -> treat as "available" unless actually selected
          // - selected -> "selected" (blue)
          // - available -> "available" (green)
          const visualState =
            s.status === "booked"
              ? "booked"
              : s.status === "held" || past
              ? "disabled"
              : isSelected
              ? "selected"
              : "available";

          const handleClick = () => {
            if (isBlocked) return;
            onToggleAction({ courtId: s.courtId, start: s.start, end: s.end });
          };

          const titleAttr =
            s.status === "booked"
              ? "Booked"
              : past
              ? "Time already passed"
              : s.status === "held"
              ? "Someone is booking this slot"
              : s.status === "heldByMe"
              ? (isSelected ? "Selected (your hold)" : "On hold (yours)")
              : s.status === "disabled"
              ? "Unavailable"
              : isSelected
              ? "Selected"
              : "Available";

          return (
            <div key={`${s.courtId}-${s.start}`} title={titleAttr}>
              <SlotButton
                state={visualState as "booked" | "disabled" | "selected" | "available"}
                label={`${s.start}–${s.end}`}
                onClick={handleClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
