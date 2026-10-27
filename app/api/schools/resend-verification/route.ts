import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAccessToken } from "@/lib/accessTokens";
import { sendMail } from "@/lib/mailer";
import { verifySchoolEmailHtml } from "@/lib/emailTemplates";

/**
 * POST /api/schools/resend-verification — body: { email }
 *
 * Public. Always answers the same way whether or not the address exists or is
 * already confirmed, so it can't be used to discover who has registered.
 * Only actually sends for a still-unconfirmed admin of a still-PENDING school.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const reply = NextResponse.json({ ok: true });
  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return reply;

  try {
    const admin = createAdminClient();
    const { data: user } = await admin.from("users").select("id, full_name, role, schools(name, status)").eq("email", address).maybeSingle();
    const school = Array.isArray(user?.schools) ? user?.schools[0] : user?.schools;
    if (!user || user.role !== "super_admin" || !school || school.status !== "pending") return reply;

    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    if (!authUser.user || authUser.user.email_confirmed_at) return reply;

    const { token, expiresInHours } = await issueAccessToken(admin, { userId: user.id, purpose: "verify" });
    await sendMail({
      to: address,
      subject: `Confirm your email for ${school.name}`,
      html: verifySchoolEmailHtml({ schoolName: school.name, fullName: user.full_name, link: `${req.nextUrl.origin}/verify-school?token=${token}`, expiresInHours }),
    });
  } catch {
    // Same answer either way.
  }
  return reply;
}
