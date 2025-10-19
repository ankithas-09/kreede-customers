import mongoose, { Schema, model, models } from "mongoose";

export interface EventDoc extends mongoose.Document {
  title: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  startTime?: string; // "HH:mm"
  endTime?: string;   // "HH:mm"
  entryFee?: number;  // optional
  link?: string;      // poster drive link
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<EventDoc>(
  {
    title: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    startTime: { type: String },
    endTime: { type: String },
    entryFee: { type: Number },
    link: { type: String },
    description: { type: String },
    tags: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: "events_and_announcements",
    strict: true,
  }
);

export const Event =
  (models.Event as mongoose.Model<EventDoc>) ||
  model<EventDoc>("Event", EventSchema);

export default Event;
