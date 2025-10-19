// app/models/Registration.ts
import mongoose, { Schema, model, models } from "mongoose";

export interface RegistrationDoc extends mongoose.Document {
  eventId: mongoose.Types.ObjectId | string;
  eventTitle?: string;

  userId: string;
  userName?: string;
  userEmail: string;

  // NEW: payment metadata (present for paid events)
  orderId?: string;         // Cashfree order_id
  paymentId?: string;       // Cashfree payment id (optional)
  amount?: number;          // charged amount in INR
  paymentStatus?: "PAID" | "REFUNDED" | "FREE";

  createdAt: Date;
  updatedAt: Date;
}

const RegistrationSchema = new Schema<RegistrationDoc>(
  {
    eventId: { type: Schema.Types.ObjectId, required: true, index: true },
    eventTitle: { type: String },

    userId: { type: String, required: true, index: true },
    userName: { type: String },
    userEmail: { type: String, required: true, index: true },

    orderId: { type: String },
    paymentId: { type: String },
    amount: { type: Number },
    paymentStatus: { type: String, enum: ["PAID", "REFUNDED", "FREE"], default: "FREE" },
  },
  {
    timestamps: true,
    collection: "registrations",
    strict: true,
  }
);

// Prevent duplicate registrations for the same user + event
RegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

export const Registration =
  (models.Registration as mongoose.Model<RegistrationDoc>) ||
  model<RegistrationDoc>("Registration", RegistrationSchema);

export default Registration;
