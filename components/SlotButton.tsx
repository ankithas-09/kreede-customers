"use client";

type Props = {
  state: "available" | "selected" | "booked" | "disabled";
  label: string;
  onClick?: () => void;
};

export default function SlotButton({ state, label, onClick }: Props) {
  const classes =
    state === "booked" ? "slot slot-booked" :
    state === "disabled" ? "slot slot-disabled" :
    state === "selected" ? "slot slot-selected" :
    "slot slot-available";

  const ariaDisabled = state === "booked" || state === "disabled";

  return (
    <button
      className={classes}
      aria-disabled={ariaDisabled}
      onClick={() => {
        if (ariaDisabled) return;
        onClick?.();
      }}
      type="button"
    >
      {label}
    </button>
  );
}
