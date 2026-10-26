import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CallerRole = "student" | "teacher" | "super_admin" | "platform_owner";

export interface CallerContext {
  userId: string;
  role: CallerRole;
  /** The caller's school. Every service-role query must be filtered by it and every insert must carry it. */
  schoolId: string;
  schoolCode: string;
}

export type CallerResult = { ok: true; ctx: CallerContext } | { ok: false; status: number; error: string };

/**
 * The ONE place server routes learn who is calling and which school they
 * belong to. Routes that use the service-role client bypass RLS entirely, so
 * they must scope every query by `ctx.schoolId` themselves — start each route
 * with this, then use `ctx.schoolId` on every read, update and insert.
 *
 * Rejects: signed-out callers (401), the platform owner (who belongs to no
 * school and has no business in school routes), callers whose school isn't
 * active — pending or suspended — (403), and roles not in `opts.roles` (403).
 */
export async function getCallerContext(opts?: { roles?: CallerRole[]; forbiddenMessage?: string }): Promise<CallerResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, status: 401, error: "Not signed in." };

  // One service-role read for role + school + school status (a suspended
  // school's own users can't read these through RLS by design).
  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("role, school_id, schools(code, status)").eq("id", auth.user.id).maybeSingle();
  if (!row) return { ok: false, status: 403, error: "Your account isn't set up." };

  const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;
  if (!row.school_id || !school) return { ok: false, status: 403, error: "This account doesn't belong to a school." };
  if (school.status !== "active") {
    return {
      ok: false,
      status: 403,
      error: school.status === "pending" ? "Your school is still waiting for approval." : "Your school's access is currently paused.",
    };
  }

  const role = row.role as CallerRole;
  if (opts?.roles && !opts.roles.includes(role)) {
    return { ok: false, status: 403, error: opts.forbiddenMessage ?? "You don't have permission to do that." };
  }

  return { ok: true, ctx: { userId: auth.user.id, role, schoolId: row.school_id, schoolCode: school.code } };
}
