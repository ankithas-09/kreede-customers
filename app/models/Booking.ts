import mongoose, { Schema, model, models } from "mongoose";

/** One hour slot like 06:00–07:00 on a given court */
export type SlotItem = {
  courtId: number;
  start: string; // "06:00"
  end: string;   // "07:00"
};

export interface BookingDoc extends mongoose.Document {
  orderId: string;                 // Cashfree order_id (unique/idempotent)
  userId: string;                  // your internal user id (from session)
  userName?: string;
  userEmail: string;
  phone?: string;

  date: string;                    // "YYYY-MM-DD"
  slots: SlotItem[];               // selected slots
  amount: number;                  // total paid in Rs
  currency: "INR";
  status: "PAID" | "PENDING" | "FAILED";
  paymentRef?: string;             // optional payment reference/txn id
  paymentRaw?: unknown;            // Cashfree payment payload snapshot

  createdAt: Date;
  updatedAt: Date;
}

const SlotSchema = new Schema<SlotItem>(
  {
    courtId: { type: Number, required: true },
    start:   { type: String, required: true },
    end:     { type: String, required: true },
  },
  { _id: false }
);

const BookingSchema = new Schema<BookingDoc>(
  {
    orderId:   { type: String, required: true, unique: true, index: true },
    userId:    { type: String, required: true, index: true },
    userName:  { type: String },
    userEmail: { type: String, required: true, index: true },
    phone:     { type: String },

    date:   { type: String, required: true, index: true }, // YYYY-MM-DD
    slots:  { type: [SlotSchema], required: true },
    amount: { type: Number, required: true },
    currency:{ type: String, default: "INR" },

    status: { type: String, enum: ["PAID", "PENDING", "FAILED"], default: "PENDING", index: true },
    paymentRef: { type: String },
    paymentRaw: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    strict: true,                 // disallow fields not in schema
    collection: "bookings",       // use a stable collection name
  }
);

// Optional helper index to quickly detect conflicts per day/court/start
// BookingSchema.index({ date: 1, "slots.courtId": 1, "slots.start": 1 });

export const Booking =
  (models.Booking as mongoose.Model<BookingDoc>) ||
  model<BookingDoc>("Booking", BookingSchema);

export default Booking;
