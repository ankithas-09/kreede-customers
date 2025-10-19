// lib/auth.ts
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

const COOKIE_NAME = "kreede_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export type SafeUser = {
  id: string;
  userId: string;
  name?: string;
  email: string;
  phone?: string;
};

type TokenPayload = JwtPayload & { user?: SafeUser };

export function setAuthCookie(res: NextResponse, user: SafeUser) {
  const token = jwt.sign({ sub: user.id, user }, JWT_SECRET, { expiresIn: "180d" });

  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
}

export function clearAuthCookie(res: NextResponse) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getUserFromRequest(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded?.user ?? null;
  } catch {
    return null;
  }
}

// ✅ fixed version of readAuthCookie for API routes
export async function readAuthCookie(): Promise<TokenPayload | null> {
  const store = await cookies(); // 👈 await here
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded; // includes user object
  } catch {
    return null;
  }
}
