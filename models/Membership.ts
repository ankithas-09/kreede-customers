import mongoose, { Schema, model, models } from "mongoose";

export type PlanId = "1M" | "3M" | "6M";

export interface MembershipDoc extends mongoose.Document {
  orderId: string;
  userId: string;
  userName?: string;
  userEmail: string;

  planId: PlanId;
  planName: string;
  durationMonths: number;

  games: number;          // total games in plan (30/90/150)
  gamesUsed: number;      // consumed games
  amount: number;
  currency: "INR";

  status: "PENDING" | "PAID" | "FAILED";
  paymentRaw?: unknown;

  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<MembershipDoc>(
  {
    orderId:        { type: String, required: true, unique: true, index: true },
    userId:         { type: String, required: true, index: true },
    userName:       { type: String },
    userEmail:      { type: String, required: true, index: true },

    planId:         { type: String, enum: ["1M", "3M", "6M"], required: true },
    planName:       { type: String, required: true },
    durationMonths: { type: Number, required: true },

    games:          { type: Number, required: true },  // total
    gamesUsed:      { type: Number, default: 0 },      // consumed

    amount:   { type: Number, required: true },
    currency: { type: String, default: "INR" },

    status: { type: String, enum: ["PENDING", "PAID", "FAILED"], default: "PENDING", index: true },
    paymentRaw: { type: Schema.Types.Mixed },
  },
  { timestamps: true, strict: true, collection: "memberships" }
);

// dev hot-reload safety
if (mongoose.models.Membership) delete mongoose.models.Membership;

const Membership =
  (models.Membership as mongoose.Model<MembershipDoc>) ||
  model<MembershipDoc>("Membership", MembershipSchema);

export default Membership;
