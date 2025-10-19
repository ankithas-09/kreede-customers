import { Schema, model, models, type HydratedDocument } from "mongoose";

export interface IUser {
  userId: string;
  name: string;
  email: string;
  phone: string;
  dob: string; // "YYYY-MM-DD"
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    name:   { type: String, required: true, trim: true },
    email:  { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:  { type: String, required: true, trim: true },
    dob:    { type: String, required: true },
  },
  { timestamps: true }
);

export const User = models.User || model<IUser>("User", UserSchema);
export type UserDoc = HydratedDocument<IUser>;
