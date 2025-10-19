// app/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import jwt, { type JwtPayload } from "jsonwebtoken";

const PROTECTED = [
  "/home",
  "/book",
  "/book/",
  "/book/checkout",
  "/membership",
  "/my-membership",
  "/my-bookings",
  "/profile",
  "/events",
];

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function verifyAuthToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.pathname;

  // Protect only the paths we care about
  if (!PROTECTED.some((p) => url === p || url.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const cookieName = process.env.COOKIE_NAME || "kreede_auth";
  const token = req.cookies.get(cookieName)?.value;
  if (!token) {
    const loginUrl = new URL("/", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    const loginUrl = new URL("/", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home",
    "/book/:path*",
    "/membership",
    "/my-membership",
    "/my-bookings",
    "/profile",
    "/events",
  ],
};
