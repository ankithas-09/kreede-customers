import { Schema, model, models } from "mongoose";

const OrderSchema = new Schema(
  {
    name:  { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    amountPaid: { type: Number, required: true }, // INR

    slots: [
      {
        courtId:   { type: Number, required: true },
        date:      { type: String, required: true },   // "YYYY-MM-DD"
        startTime: { type: String, required: true },   // "HH:mm"
        endTime:   { type: String, required: true },   // "HH:mm"
        price:     { type: Number, required: true },   // per slot price
      },
    ],

    status: { type: String, default: "paid" },
  },
  { timestamps: true }
);

export const Order = models.Order || model("Order", OrderSchema);
