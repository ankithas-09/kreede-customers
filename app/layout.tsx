import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KREEDE Court Booking",
  description: "Select and book court time slots — responsive and fast.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
