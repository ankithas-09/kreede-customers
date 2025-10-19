export type Slot = { start: string; end: string };

export type CourtSlot = {
  courtId: number;
  start: string;
  end: string;
  status: "available" | "booked" | "disabled";
};

/** Build 1-hour slots from 06:00–23:00 (last slot is 22:00–23:00) */
export function buildSlots(): Slot[] {
  const out: Slot[] = [];
  for (let h = 6; h < 23; h++) {
    const start = `${String(h).padStart(2, "0")}:00`;
    const end = `${String(h + 1).padStart(2, "0")}:00`;
    out.push({ start, end });
  }
  return out; // 17 slots
}

/**
 * FRONTEND MOCK ONLY:
 * - Court 2 has 08:00 & 10:00 as "booked"
 * - For "today", all slots with end <= current hour are "disabled"
 */
export function mockAvailability(dateISO: string): CourtSlot[][] {
  const slots = buildSlots();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentHour = now.getHours();

  return [1, 2, 3].map((courtId) =>
    slots.map(({ start, end }) => {
      let status: CourtSlot["status"] = "available";

      // demo booked slots
      if (courtId === 2 && (start === "08:00" || start === "10:00")) {
        status = "booked";
      }

      // disable past slots for "today" based on local time
      if (dateISO === today && parseInt(end.slice(0, 2)) <= currentHour) {
        status = "disabled";
      }

      return { courtId, start, end, status };
    })
  );
}
