import { Suspense } from "react";
import MembershipClient from "./MembershipClient";

export default function MembershipPage() {
  return (
    <Suspense
      fallback={
        <div className="book-page">
          <main className="container">
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: 0 }}>
              Buy Membership
            </h1>
            <div className="card" style={{ color: "#111" }}>Loading…</div>
          </main>
        </div>
      }
    >
      <MembershipClient />
    </Suspense>
  );
}
