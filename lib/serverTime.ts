"use client";

/**
 * Corrects for a wrong — or deliberately altered — device clock by
 * comparing it against the server's own clock once, then applying that
 * fixed offset to every subsequent "what time is it" check. See
 * app/api/server-time/route.ts for why this matters and what it does and
 * doesn't protect against (the real enforcement is server-side already;
 * this fixes what the student sees to match it).
 */

let cachedOffsetMs: number | null = null;

/**
 * Fetches the server's clock once and caches the offset from the
 * device's own clock for the rest of the page session. Safe to call
 * from multiple places — later calls reuse the cached offset instead of
 * re-fetching. If the request fails for any reason, falls back to
 * trusting the device clock (offset 0) rather than breaking the page.
 */
export async function getClockOffsetMs(): Promise<number> {
  if (cachedOffsetMs !== null) return cachedOffsetMs;
  try {
    const requestedAt = Date.now();
    const res = await fetch("/api/server-time");
    const data = await res.json();
    const respondedAt = Date.now();
    // Splits the round-trip latency evenly as a simple correction —
    // not perfectly precise, but more than accurate enough for a
    // minutes-wide exam batch window.
    const latency = (respondedAt - requestedAt) / 2;
    const serverNowAtResponse = new Date(data.serverTime).getTime() + latency;
    cachedOffsetMs = serverNowAtResponse - respondedAt;
  } catch {
    cachedOffsetMs = 0;
  }
  return cachedOffsetMs;
}

/** The corrected current time — use this instead of `new Date()` anywhere a batch window or other server-enforced deadline is being checked for display purposes. */
export async function getReliableNow(): Promise<Date> {
  const offset = await getClockOffsetMs();
  return new Date(Date.now() + offset);
}

/** Synchronous version for use inside a render/update loop once the offset has already been fetched at least once this page session. */
export function getReliableNowSync(): Date {
  return new Date(Date.now() + (cachedOffsetMs ?? 0));
}
