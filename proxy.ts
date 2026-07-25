import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

/**
 * Single choke point gating every page behind a session.
 * Builds its own NextAuth() instance from the edge-safe auth.config.ts -
 * deliberately NOT importing auth.ts, whose Credentials provider pulls in
 * bcrypt and the lib/data.ts chain, neither of which runs on the Edge runtime.
 * JWT verification (all this needs) doesn't require any of that.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Every route except the Auth.js API, the login page, and Next.js internals
  // requires a session.
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
