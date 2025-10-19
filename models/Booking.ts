// @/models/Booking.ts
import mongoose, { Schema, model, models } from "mongoose";

export interface BookingDoc extends mongoose.Document {
  courtId: number;            // Court number
  date: string;               // "YYYY-MM-DD"
  startTime: string;          // "HH:mm"
  endTime: string;            // "HH:mm"
  name: string;               // Booker name
  email: string;              // Booker email
  phone: string;              // Booker phone
  price: number;              // Price for this slot (e.g. 500)
  status: "confirmed" | "cancelled" | "refunded";
  createdAt: Date;
  updatedAt: Date;
}

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;     // 00:00 - 23:59
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;           // YYYY-MM-DD

const BookingSchema = new Schema<BookingDoc>(
  {
    courtId: { type: Number, required: true, min: 1, index: true },

    // keep as string to match your handlers; validate format
    date: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => dateRegex.test(v),
        message: "date must be in YYYY-MM-DD format",
      },
      index: true,
    },

    startTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => timeRegex.test(v),
        message: "startTime must be in HH:mm (24h) format",
      },
      index: true,
    },

    endTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => timeRegex.test(v),
        message: "endTime must be in HH:mm (24h) format",
      },
    },

    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    price:  { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["confirmed", "cancelled", "refunded"], default: "confirmed", index: true },
  },
  {
    timestamps: true,
    collection: "bookings",   // use the same collection name you intend
    strict: true,
  }
);

// Prevent double-booking the same court/date/startTime
BookingSchema.index({ courtId: 1, date: 1, startTime: 1 }, { unique: true });

// Helpful secondary index if you often query by email
BookingSchema.index({ email: 1, date: -1 });

export const Booking =
  (models.Booking as mongoose.Model<BookingDoc>) ||
  model<BookingDoc>("Booking", BookingSchema);

export default Booking;
