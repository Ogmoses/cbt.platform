import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveStudentPassword, studentInternalEmail } from "@/lib/studentCredential";
import { issueAccessToken } from "@/lib/accessTokens";
import { sendMail } from "@/lib/mailer";
import { inviteEmailHtml } from "@/lib/emailTemplates";
import { getSchoolNameServer } from "@/lib/schoolProfileServer";
import { getCallerContext } from "@/lib/auth/callerContext";

/**
 * POST /api/admin/people/bulk-import
 * body: { role: "student" | "teacher", rows: ImportRow[] }
 *
 * One row failing (duplicate ID, etc.) shouldn't sink the other 40 in the
 * file — every row gets its own try/catch, and the response reports
 * exactly which ones failed and why instead of an all-or-nothing result.
 *
 * Same split as the single-account route: students log in with name +
 * student ID alone (see lib/studentCredential.ts), so there's no
 * credential to generate or report per row, and no email needed from the
 * CSV at all. Teachers get a custom invite email per row via our own SMTP
 * (see lib/accessTokens.ts + lib/mailer.ts) — importing 40 teachers means
 * 40 emails going out, so make sure SMTP_* env vars are set before a big
 * import.
 */

export async function POST(req: NextRequest) {
  const guard = await getCallerContext({ roles: ["super_admin"], forbiddenMessage: "Only an admin can import accounts." });
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { ctx } = guard;

  const { role, rows } = await req.json();
  if (!role || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "role and a non-empty rows array are required." }, { status: 400 });
  }
  if (role !== "student" && role !== "teacher") {
    return NextResponse.json({ error: "Only students and teachers can be imported." }, { status: 400 });
  }

  const admin = createAdminClient();
  // Fetched once per import batch, not once per row — same value for every
  // teacher email in this run, so there's no reason to hit the DB 40 times.
  const schoolName = role === "teacher" ? await getSchoolNameServer(admin, ctx.schoolId) : "";
  // "identifier" is whichever field actually names the row in the results
  // list — a student's own student ID (they have no email at all now), or
  // a teacher's email (still how they're invited).
  const results: { identifier: string; ok: boolean; error?: string; invited?: boolean }[] = [];

  for (const row of rows) {
    const identifier = role === "student" ? (row.admissionNumber ?? row.fullName) : row.email;
    try {
      let authUserId: string;

      if (role === "student") {
        const email = studentInternalEmail(row.admissionNumber, ctx.schoolCode);
        const password = deriveStudentPassword(row.fullName, row.admissionNumber);
        const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (authError || !created.user) throw new Error(authError?.message ?? "Couldn't create the account.");
        authUserId = created.user.id;

        const { error: profileError } = await admin.from("users").insert({
          id: authUserId,
          school_id: ctx.schoolId,
          role,
          full_name: row.fullName,
          email,
          admission_number: row.admissionNumber || null,
          class_id: row.classId || null,
          is_active: true,
        });
        if (profileError) {
          await admin.auth.admin.deleteUser(authUserId);
          throw new Error(profileError.message);
        }
      } else {
        const lockedPassword = crypto.randomBytes(24).toString("base64url");
        const { data: created, error: authError } = await admin.auth.admin.createUser({
          email: row.email,
          password: lockedPassword,
          email_confirm: true,
        });
        if (authError || !created.user) throw new Error(authError?.message ?? "Couldn't create the account.");
        authUserId = created.user.id;

        const { error: profileError } = await admin.from("users").insert({
          id: authUserId,
          school_id: ctx.schoolId,
          role,
          full_name: row.fullName,
          email: row.email,
          staff_id: row.staffId || null,
          is_active: true,
        });
        if (profileError) {
          await admin.auth.admin.deleteUser(authUserId);
          throw new Error(profileError.message);
        }

        try {
          const { token, expiresInHours } = await issueAccessToken(admin, { userId: authUserId, purpose: "invite" });
          const link = `${req.nextUrl.origin}/set-password?token=${token}`;
          await sendMail({
            to: row.email,
            subject: `Set up your account at ${schoolName}`,
            html: inviteEmailHtml({ schoolName, fullName: row.fullName, link, expiresInHours }),
          });
        } catch (mailErr) {
          await admin.auth.admin.deleteUser(authUserId);
          throw new Error(mailErr instanceof Error ? mailErr.message : "Couldn't send the invite email.");
        }
      }

      results.push({ identifier, ok: true, invited: role !== "student" });
    } catch (err) {
      results.push({ identifier, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ successCount, failureCount: results.length - successCount, results });
}
