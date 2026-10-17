import { NextResponse } from "next/server";

/**
 * GET /api/server-time
 *
 * Returns the server's own clock. The real security boundary for "is
 * this batch open" already lives in app/api/exam-sessions/start/route.ts,
 * which checks the batch window against the server's own `new Date()` —
 * a student changing their device's clock can't actually start an exam
 * early that way, that request would still be rejected server-side.
 *
 * What a wrong (or deliberately fast-forwarded) device clock *can* do is
 * mislead the student-facing display: a slow/incorrect clock can hide an
 * exam that's genuinely open right now, and a fast-forwarded one can
 * make an exam look available before it actually is — which the student
 * would then find out the hard way when the real (server-checked) start
 * request gets rejected. Fetching this once when the launchpad loads and
 * computing the offset from the device's own clock fixes the *display*
 * to match reality, on top of the already-sound server-side check.
 *
 * No auth required — this leaks nothing beyond the current time.
 */
export async function GET() {
  return NextResponse.json({ serverTime: new Date().toISOString() });
}
