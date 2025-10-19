// app/models/EventRefund.ts
import mongoose, { Schema, model, models } from "mongoose";

export interface EventRefundDoc extends mongoose.Document {
  // Who
  userId: string;
  userEmail: string;
  userName?: string;

  // Which event / registration
  eventId: string;
  eventTitle?: string;
  registrationId?: string;

  // Order / money (0 for free events)
  orderId?: string;
  amount: number;                    // refunded (or 0)
  currency: "INR";

  // Gateway/refund
  gateway: "CASHFREE" | "NONE";
  refundId?: string;                 // cashfree refund id if any
  gatewayResponse?: unknown;         // raw response or error

  // Status
  status: "SUCCESS" | "FAILED" | "NO_PAYMENT";
  reason?: string;                   // e.g. "Event cancellation within window"

  createdAt: Date;
  updatedAt: Date;
}

const EventRefundSchema = new Schema<EventRefundDoc>(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true, index: true },
    userName: { type: String },

    eventId: { type: String, required: true, index: true },
    eventTitle: { type: String },
    registrationId: { type: String },

    orderId: { type: String },
    amount: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: "INR" },

    gateway: { type: String, enum: ["CASHFREE", "NONE"], required: true, default: "NONE" },
    refundId: { type: String },
    gatewayResponse: { type: Schema.Types.Mixed },

    status: { type: String, enum: ["SUCCESS", "FAILED", "NO_PAYMENT"], required: true },
    reason: { type: String },
  },
  {
    timestamps: true,
    collection: "event_refunds",
    strict: true,
  }
);

// Helpful index if you ever enforce idempotency
EventRefundSchema.index({ eventId: 1, userId: 1, registrationId: 1 });

export const EventRefund =
  (models.EventRefund as mongoose.Model<EventRefundDoc>) ||
  model<EventRefundDoc>("EventRefund", EventRefundSchema);

export default EventRefund;
