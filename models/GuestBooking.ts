import mongoose, { Schema, model, models } from "mongoose";

/** One hour slot like 06:00–07:00 on a given court */
export type GuestSlotItem = {
  courtId: number;
  start: string; // "06:00"
  end: string;   // "07:00"
};

export interface GuestBookingDoc extends mongoose.Document {
  orderId: string;                 // guest order id (unique/idempotent)
  userName?: string;
  userEmail?: string;

  date: string;                    // "YYYY-MM-DD"
  slots: GuestSlotItem[];          // selected slots
  amount: number;                  // total paid
  currency: "INR";
  status: "PAID" | "PENDING" | "FAILED";
  paymentRef?: string;
  paymentRaw?: unknown;

  createdAt: Date;
  updatedAt: Date;
}

const GuestSlotSchema = new Schema<GuestSlotItem>(
  {
    courtId: { type: Number, required: true },
    start:   { type: String, required: true },
    end:     { type: String, required: true },
  },
  { _id: false }
);

const GuestBookingSchema = new Schema<GuestBookingDoc>(
  {
    orderId:   { type: String, required: true, unique: true, index: true },
    userName:  { type: String },
    userEmail: { type: String, index: true },

    date:   { type: String, required: true, index: true }, // YYYY-MM-DD
    slots:  { type: [GuestSlotSchema], required: true },
    amount: { type: Number, required: true },
    currency:{ type: String, default: "INR" },

    status: { type: String, enum: ["PAID", "PENDING", "FAILED"], default: "PENDING", index: true },
    paymentRef: { type: String },
    paymentRaw: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    strict: true,
    collection: "guest_bookings", // IMPORTANT: separate collection
  }
);

// Optional helper index to quickly detect conflicts per day/court/start
// GuestBookingSchema.index({ date: 1, "slots.courtId": 1, "slots.start": 1 });

export const GuestBooking =
  (models.GuestBooking as mongoose.Model<GuestBookingDoc>) ||
  model<GuestBookingDoc>("GuestBooking", GuestBookingSchema);

export default GuestBooking;
