import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { buildConsentUrl } from "@/lib/google/oauth";
import { requireAdminApi } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const origin = new URL(request.url).origin;

  // CSRF: a one-time value echoed back by Google and checked in the callback.
  const state = randomBytes(24).toString("base64url");

  try {
    const response = NextResponse.redirect(buildConsentUrl(origin, state));
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google is not configured.";
    return NextResponse.redirect(
      new URL(`/admin/settings?calendar_error=${encodeURIComponent(message)}`, origin)
    );
  }
}
