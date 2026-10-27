import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Custom invite/reset tokens — server-only, never import from a "use
 * client" component.
 *
 * Why not Supabase Auth's built-in inviteUserByEmail / resetPasswordForEmail:
 * those tokens are consumed the instant the link is opened (Supabase's
 * client-side SDK parses the URL and immediately starts a session). School
 * mail-scanners open links automatically to check they're safe, which burns
 * the token before the real person clicks it — "invalid or expired" on the
 * very first genuine click, indistinguishable from an actually-expired link.
 *
 * These tokens are only consumed by consumeAccessToken(), which is only
 * ever called from the password-submit API routes — never from a page
 * load. Opening the link (by a person or a scanner) does nothing.
 */

export type AccessTokenPurpose = "invite" | "reset" | "verify";

const TTL_HOURS: Record<AccessTokenPurpose, number> = {
  invite: 168, // 7 days — teachers don't always act on this the same day
  reset: 2, // shorter-lived: this is an active "I need in right now" case
  verify: 48, // confirming a new school admin's email address (self-signup)
};

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a new token for this user + purpose and returns the raw value to
 * put in the email link. Deletes any previous unused tokens of the same
 * purpose for this user first, so resending always makes the latest link
 * the only valid one — no ambiguity about which of several emails is live.
 */
export async function issueAccessToken(
  admin: SupabaseClient,
  opts: { userId: string; purpose: AccessTokenPurpose }
): Promise<{ token: string; expiresInHours: number }> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresInHours = TTL_HOURS[opts.purpose];
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  // The token inherits the account's school (service-role inserts have no
  // signed-in user to infer it from).
  const { data: owner } = await admin.from("users").select("school_id").eq("id", opts.userId).maybeSingle();
  if (!owner?.school_id) throw new Error("Couldn't create access token: that account has no school.");

  await admin.from("access_tokens").delete().eq("user_id", opts.userId).eq("purpose", opts.purpose).is("used_at", null);

  const { error } = await admin.from("access_tokens").insert({
    school_id: owner.school_id,
    user_id: opts.userId,
    purpose: opts.purpose,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Couldn't create access token: ${error.message}`);

  return { token: rawToken, expiresInHours };
}

export type ConsumeResult =
  | { ok: true; userId: string; email: string | null; fullName: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Validates a token and, if valid, marks it used and returns the account it
 * belongs to. Call this only at the moment of actually setting the new
 * password — never on page load — since marking it used here is what
 * prevents replay.
 */
export async function consumeAccessToken(
  admin: SupabaseClient,
  opts: { token: string; purpose: AccessTokenPurpose }
): Promise<ConsumeResult> {
  const tokenHash = hashToken(opts.token);

  const { data: row } = await admin
    .from("access_tokens")
    .select("id, user_id, used_at, expires_at")
    .eq("token_hash", tokenHash)
    .eq("purpose", opts.purpose)
    .maybeSingle();

  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const { data: user } = await admin.from("users").select("id, email, full_name").eq("id", row.user_id).single();
  if (!user) return { ok: false, reason: "invalid" };

  // Mark this token used, and clean up any siblings of the same purpose for
  // this user so an old, still-unused link can't later be replayed after
  // the password's already been set through a different one.
  await admin.from("access_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await admin.from("access_tokens").delete().eq("user_id", row.user_id).eq("purpose", opts.purpose).is("used_at", null);

  return { ok: true, userId: user.id, email: user.email, fullName: user.full_name };
}

export function reasonMessage(reason: "invalid" | "expired" | "used"): string {
  switch (reason) {
    case "expired":
      return "This link has expired. Ask your admin to resend it.";
    case "used":
      return "This link has already been used. Ask your admin to resend it if you still need it.";
    default:
      return "This link isn't valid. Ask your admin to resend it.";
  }
}
