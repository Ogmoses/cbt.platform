import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeAccessToken, reasonMessage } from "@/lib/accessTokens";
import { sendMail } from "@/lib/mailer";
import { ownerNewSignupEmailHtml } from "@/lib/emailTemplates";

/**
 * POST /api/schools/verify — body: { token }
 *
 * Public. Confirms a new school admin's email: lifts the sign-in ban set at
 * registration and marks the address confirmed. Like every other token in
 * this app, it is consumed only on this explicit POST, never when the page
 * is merely opened (so mail scanners can't burn it). The school STAYS
 * pending — only the platform owner can approve it.
 */
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "token is required." }, { status: 400 });

  const admin = createAdminClient();
  const result = await consumeAccessToken(admin, { token, purpose: "verify" });
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This link has expired. Request a new confirmation email from the registration page."
        : result.reason === "used"
          ? "This email has already been confirmed."
          : reasonMessage(result.reason);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error } = await admin.auth.admin.updateUserById(result.userId, { ban_duration: "none", email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await admin.from("users").select("school_id, full_name, email, schools(name)").eq("id", result.userId).maybeSingle();
  const school = Array.isArray(profile?.schools) ? profile?.schools[0] : profile?.schools;

  // Tell the platform owner(s) someone is waiting. Best effort — approval
  // doesn't depend on this email arriving.
  try {
    const { data: owners } = await admin.from("users").select("email").eq("role", "platform_owner");
    for (const o of owners ?? []) {
      if (!o.email) continue;
      await sendMail({
        to: o.email,
        subject: `New school waiting for approval: ${school?.name ?? "a school"}`,
        html: ownerNewSignupEmailHtml({
          schoolName: school?.name ?? "A school",
          adminName: profile?.full_name ?? "",
          adminEmail: profile?.email ?? "",
          link: `${req.nextUrl.origin}/owner`,
        }),
      });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, schoolName: school?.name ?? null });
}
