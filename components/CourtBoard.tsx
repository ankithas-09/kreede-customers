"use client";

import SlotButton from "./SlotButton";

export type CourtSlot = {
  courtId: number;
  start: string;
  end: string;
  status: "available" | "booked" | "disabled";
};

type Selection = { courtId: number; start: string; end: string };

type Props = {
  title: string;
  data: CourtSlot[];
  selected: Selection[];
  onToggle: (s: Selection) => void;
};

export default function CourtBoard({ title, data, selected, onToggle }: Props) {
  return (
    <div className="card">
      <h2 style={{ fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <div className="grid grid-2">
        {data.map((s) => {
          const isSelected = selected.some(
            (x) => x.courtId === s.courtId && x.start === s.start
          );
          const state =
            s.status === "booked"
              ? "booked"
              : s.status === "disabled"
              ? "disabled"
              : isSelected
              ? "selected"
              : "available";

          return (
            <SlotButton
              key={`${s.courtId}-${s.start}`}
              state={state}
              label={`${s.start}–${s.end}`}
              onClick={() =>
                onToggle({ courtId: s.courtId, start: s.start, end: s.end })
              }
            />
          );
        })}
      </div>
    </div>
  );
}
