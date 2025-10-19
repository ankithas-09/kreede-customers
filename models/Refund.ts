// app/models/Refund.ts
import mongoose, { Schema, model, models } from "mongoose";

export interface RefundDoc extends mongoose.Document {
  // Who / what
  userId: string;
  userEmail: string;
  userName?: string;

  // What was cancelled
  source: "BOOKING";                  // (future-proof: could be "EVENT")
  bookingId: string;                  // court booking _id
  orderId?: string;                   // Cashfree order id (if paid)
  slotIndex?: number;                 // which slot got cancelled in an order

  // Money
  amount: number;                     // refunded (or 0 for membership)
  currency: "INR";
  paymentRef?: string;                // e.g. "MEMBERSHIP" for free bookings

  // Gateway
  gateway?: "CASHFREE" | "NONE";
  refundId?: string;                  // cashfree refund id (if any)
  gatewayResponse?: unknown;          // raw gateway payload (safe to store)

  // Status
  status: "SUCCESS" | "FAILED" | "NO_PAYMENT"; // NO_PAYMENT when membership
  reason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<RefundDoc>(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true, index: true },
    userName: { type: String },

    source: { type: String, enum: ["BOOKING"], required: true, default: "BOOKING" },
    bookingId: { type: String, required: true, index: true },
    orderId: { type: String },
    slotIndex: { type: Number },

    amount: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: "INR" },
    paymentRef: { type: String },

    gateway: { type: String, enum: ["CASHFREE", "NONE"], default: "NONE" },
    refundId: { type: String },
    gatewayResponse: { type: Schema.Types.Mixed },

    status: { type: String, enum: ["SUCCESS", "FAILED", "NO_PAYMENT"], required: true },
    reason: { type: String },
  },
  {
    timestamps: true,
    collection: "refunds",
    strict: true,
  }
);

// Useful compound index if you ever need to ensure idempotency
RefundSchema.index({ source: 1, bookingId: 1, slotIndex: 1 }, { unique: false });

export const Refund =
  (models.Refund as mongoose.Model<RefundDoc>) ||
  model<RefundDoc>("Refund", RefundSchema);

export default Refund;
