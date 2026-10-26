import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAccessToken } from "@/lib/accessTokens";
import { sendMail } from "@/lib/mailer";
import { inviteEmailHtml } from "@/lib/emailTemplates";

/**
 * Platform-owner console actions. Only the platform owner may call this; it
 * uses the service role (the status column of `schools` is deliberately not
 * writable from the browser), so the role check below is the gate.
 *
 *   POST  — add a school by hand: creates it already ACTIVE (which also gives
 *           it the default grading scale, see migration 014) and invites its
 *           first admin by email.
 *   PATCH — { id, action }: "approve" (pending -> active, optionally fixing
 *           the code first), "suspend" (active -> suspended),
 *           "reactivate" (suspended -> active).
 */

const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireOwner() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, status: 401, error: "Not signed in." };
  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (row?.role !== "platform_owner") return { ok: false as const, status: 403, error: "Only the platform owner can do this." };
  return { ok: true as const, userId: auth.user.id };
}

function validCode(code: unknown): code is string {
  return typeof code === "string" && CODE_RE.test(code) && code.length >= 3 && code.length <= 40;
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim().toLowerCase();
  const adminName = String(body.adminName ?? "").trim();
  const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();

  if (!name) return NextResponse.json({ error: "Enter the school's name." }, { status: 400 });
  if (!validCode(code)) {
    return NextResponse.json({ error: "The school code must be 3–40 characters: lowercase letters, numbers and single dashes (e.g. bright-future)." }, { status: 400 });
  }
  if (!adminName) return NextResponse.json({ error: "Enter the first admin's name." }, { status: 400 });
  if (!EMAIL_RE.test(adminEmail)) return NextResponse.json({ error: "Enter a valid email for the first admin." }, { status: 400 });

  const admin = createAdminClient();

  const { data: codeTaken } = await admin.from("schools").select("id").eq("code", code).maybeSingle();
  if (codeTaken) return NextResponse.json({ error: "That school code is already used. Pick another." }, { status: 409 });
  const { data: emailTaken } = await admin.from("users").select("id").eq("email", adminEmail).maybeSingle();
  if (emailTaken) return NextResponse.json({ error: "That email already belongs to an account. One email can only belong to one school." }, { status: 409 });

  // Active straight away: the owner is the one adding it. (The insert also
  // seeds the default grading scale via a trigger.)
  const { data: school, error: schoolError } = await admin
    .from("schools")
    .insert({ name, code, status: "active", approved_at: new Date().toISOString() })
    .select("id, name, code, status")
    .single();
  if (schoolError || !school) {
    return NextResponse.json({ error: schoolError?.message ?? "Couldn't create the school." }, { status: 500 });
  }

  // Undo everything if a later step fails, so a half-made school never lingers.
  const undo = async (authUserId?: string) => {
    if (authUserId) await admin.auth.admin.deleteUser(authUserId); // cascades to its users row
    await admin.from("grading_scale").delete().eq("school_id", school.id);
    await admin.from("schools").delete().eq("id", school.id);
  };

  const lockedPassword = crypto.randomBytes(24).toString("base64url");
  const { data: created, error: authError } = await admin.auth.admin.createUser({ email: adminEmail, password: lockedPassword, email_confirm: true });
  if (authError || !created.user) {
    await undo();
    return NextResponse.json({ error: authError?.message ?? "Couldn't create the admin account." }, { status: 500 });
  }

  const { error: profileError } = await admin.from("users").insert({
    id: created.user.id,
    school_id: school.id,
    role: "super_admin",
    full_name: adminName,
    email: adminEmail,
    is_active: true,
  });
  if (profileError) {
    await undo(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  try {
    const { token, expiresInHours } = await issueAccessToken(admin, { userId: created.user.id, purpose: "invite" });
    const link = `${req.nextUrl.origin}/set-password?token=${token}`;
    await sendMail({
      to: adminEmail,
      subject: `Set up your account at ${school.name}`,
      html: inviteEmailHtml({ schoolName: school.name, fullName: adminName, link, expiresInHours }),
    });
  } catch (err) {
    await undo(created.user.id);
    return NextResponse.json({ error: `Couldn't send the invite email, so nothing was created. (${err instanceof Error ? err.message : "mail error"})` }, { status: 502 });
  }

  return NextResponse.json({ school, link: `${req.nextUrl.origin}/s/${school.code}` });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id, action, code } = await req.json();
  if (!id || !["approve", "suspend", "reactivate"].includes(action)) {
    return NextResponse.json({ error: "id and a valid action are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: school } = await admin.from("schools").select("id, status, code").eq("id", id).maybeSingle();
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  let patch: Record<string, unknown>;
  if (action === "approve") {
    if (school.status !== "pending") return NextResponse.json({ error: "Only a pending school can be approved." }, { status: 409 });
    patch = { status: "active", approved_at: new Date().toISOString() };
    // The code can still be corrected while pending (it's locked after approval).
    if (typeof code === "string" && code.trim() && code.trim().toLowerCase() !== school.code) {
      const next = code.trim().toLowerCase();
      if (!validCode(next)) return NextResponse.json({ error: "That school code isn't valid." }, { status: 400 });
      const { data: taken } = await admin.from("schools").select("id").eq("code", next).maybeSingle();
      if (taken) return NextResponse.json({ error: "That school code is already used." }, { status: 409 });
      patch.code = next;
    }
  } else if (action === "suspend") {
    if (school.status !== "active") return NextResponse.json({ error: "Only an active school can be suspended." }, { status: 409 });
    patch = { status: "suspended" };
  } else {
    if (school.status !== "suspended") return NextResponse.json({ error: "Only a suspended school can be reactivated." }, { status: 409 });
    patch = { status: "active" };
  }

  const { data: updated, error } = await admin.from("schools").update(patch).eq("id", id).select("id, status, code").single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Couldn't update the school." }, { status: 500 });

  return NextResponse.json({ school: updated });
}
