import { Suspense } from "react";
import CheckoutClient from "./CheckoutClient";

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="book-page">
          <main className="container">
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#111" }}>
              Checkout
            </h1>
            <div className="card" style={{ color: "#111" }}>Loading…</div>
          </main>
        </div>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
