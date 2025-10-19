// scripts/drop-legacy-index.js
const { MongoClient } = require("mongodb");

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI in env");

  // Prefer explicit DB via env; else parse from URI path; else fallback
  const fromUriPath = (() => {
    try {
      const u = new URL(uri);
      const name = (u.pathname || "").replace(/^\//, "");
      return name || null;
    } catch { return null; }
  })();

  const dbName = process.env.MONGODB_DB || fromUriPath || "test";

  console.log("Connecting to DB:", dbName);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    // Ensure the collection exists before listing indexes
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const hasBookings = collections.some(c => c.name === "bookings");
    if (!hasBookings) {
      console.log(`Collection "${dbName}.bookings" does not exist. Nothing to drop.`);
      return;
    }

    const col = db.collection("bookings");

    const before = await col.indexes();
    console.log("Current indexes:", before);

    try {
      await col.dropIndex("courtId_1_date_1_startTime_1");
      console.log("✅ Dropped legacy index: courtId_1_date_1_startTime_1");
    } catch (e) {
      console.log("⚠️ Drop index skipped:", e.message);
    }

    const after = await col.indexes();
    console.log("After:", after);
  } finally {
    await client.close();
  }
})();
