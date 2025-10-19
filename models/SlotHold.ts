import mongoose, { Schema, model, models } from "mongoose";

/**
 * A temporary slot hold for the given day/court/start time.
 * Auto-expires via TTL 5 minutes after `expiresAt`.
 *
 * We set `expiresAt = now + 5 minutes` whenever a hold is created or refreshed.
 * MongoDB's TTL monitor will delete the doc automatically after that time.
 */

export interface SlotHoldDoc extends mongoose.Document {
  date: string;          // "YYYY-MM-DD"
  courtId: number;       // 1..N
  start: string;         // "HH:00"
  clientId: string;      // stable id from browser (localStorage)
  userId?: string;       // optional, if you want to tie to a logged-in user
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;       // TTL index (expire at this time)
}

// 7 minutes in ms
export const HOLD_TTL_MS = 5 * 60 * 1000;

const SlotHoldSchema = new Schema<SlotHoldDoc>(
  {
    date:     { type: String, required: true, index: true }, // "YYYY-MM-DD"
    courtId:  { type: Number, required: true, index: true },
    start:    { type: String, required: true, index: true }, // "HH:00"
    clientId: { type: String, required: true, index: true },
    userId:   { type: String },

    // TTL anchor
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
    strict: true,
    collection: "slot_holds",
  }
);

// Only one active hold per (date, courtId, start)
SlotHoldSchema.index({ date: 1, courtId: 1, start: 1 }, { unique: true });

// TTL index: expire when `expiresAt` passes. `expireAfterSeconds: 0` means "at the time".
SlotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helpful static to compute a fresh expiresAt
export function computeExpiresAt(from = new Date()) {
  return new Date(from.getTime() + HOLD_TTL_MS);
}

const SlotHold =
  (models.SlotHold as mongoose.Model<SlotHoldDoc>) ||
  model<SlotHoldDoc>("SlotHold", SlotHoldSchema);

export default SlotHold;
