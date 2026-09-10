import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { configWarnings } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness plus a configuration read-out. The warnings are the ones that
 * present as "sign-in loops back to the login page" or "Touch ID throws" —
 * both of which are near-impossible to diagnose from the browser, and both
 * of which are easy to hit the first time the app goes behind a proxy.
 */
export async function GET() {
  const warnings = configWarnings();

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: false, warnings }, { status: 503 });
  }

  return NextResponse.json({ ok: true, db: true, warnings });
}
