// app/book/guest/confirmed/page.tsx
import { Suspense } from "react";
import GuestConfirmedClient from "./GuestConfirmedClient";

export default function GuestConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="book-page">
          <main className="container">
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#111" }}>
              Booking Confirmed
            </h1>
            <div className="card" style={{ color: "#111" }}>Loading booking…</div>
          </main>
        </div>
      }
    >
      <GuestConfirmedClient />
    </Suspense>
  );
}
