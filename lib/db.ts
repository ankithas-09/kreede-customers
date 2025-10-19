// lib/db.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;
if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalAny = global as unknown as { _mongoose?: MongooseCache };

const cached: MongooseCache = globalAny._mongoose ?? { conn: null, promise: null };

if (!globalAny._mongoose) {
  globalAny._mongoose = cached;
}

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { dbName: "kreede_booking" });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
