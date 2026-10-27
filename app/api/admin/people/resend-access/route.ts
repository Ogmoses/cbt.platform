import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAccessToken } from "@/lib/accessTokens";
import { sendMail } from "@/lib/mailer";
import { resetEmailHtml } from "@/lib/emailTemplates";
import { getSchoolNameServer } from "@/lib/schoolProfileServer";
import { getCallerContext } from "@/lib/auth/callerContext";

/**
 * POST /api/admin/people/resend-access
 * body: { email: string }
 *
 * For a teacher account that already exists — invite never arrived,
 * password forgotten, or the admin just wants to force a reset. Issues a
 * fresh "reset" access token (see lib/accessTokens.ts) and emails a link to
 * /reset-password. Any previous unused reset token for this account is
 * invalidated as part of issuing the new one, so only the latest email's
 * link is ever live.
 */
export async function POST(req: NextRequest) {
  const guard = await getCallerContext({ roles: ["super_admin"], forbiddenMessage: "Only an admin can do this." });
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { ctx } = guard;

  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "email is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: user, error: lookupError } = await admin.from("users").select("id, full_name").eq("email", email.trim()).eq("school_id", ctx.schoolId).maybeSingle();
  if (lookupError || !user) {
    return NextResponse.json({ error: "No account found with that email." }, { status: 404 });
  }

  try {
    const { token, expiresInHours } = await issueAccessToken(admin, { userId: user.id, purpose: "reset" });
    const schoolName = await getSchoolNameServer(admin, ctx.schoolId);
    const link = `${req.nextUrl.origin}/reset-password?token=${token}&school=${ctx.schoolCode}`;
    await sendMail({
      to: email.trim(),
      subject: `Reset your password — ${schoolName}`,
      html: resetEmailHtml({ schoolName, fullName: user.full_name, link, expiresInHours }),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't send the email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
