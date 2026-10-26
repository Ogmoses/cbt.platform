import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/resolve-student-email
 * body: { studentId: string, schoolCode?: string }
 *
 * Student IDs are only unique WITHIN a school, so once more than one school
 * exists the school must be known: pass `schoolCode` (the code in the
 * /s/<code> login URL). Without it, the lookup only succeeds while exactly
 * one school has a matching ID; if several do, the student is asked to use
 * their own school's link.
 *
 * Runs before the student is signed in, so RLS (which keys off auth.uid())
 * can't help here — this uses the service-role client instead, and
 * deliberately returns nothing but the email on success, and a generic
 * error on failure, so it can't be used to enumerate valid student IDs
 * or leak anything else about the account.
 */
export async function POST(req: NextRequest) {
  const { studentId, schoolCode } = await req.json();
  if (!studentId?.trim()) {
    return NextResponse.json({ error: "Enter your student ID." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const notFound = NextResponse.json({ error: "We couldn't find that student ID." }, { status: 404 });

  let query = supabase.from("users").select("email").ilike("admission_number", studentId.trim()).eq("role", "student");

  if (typeof schoolCode === "string" && schoolCode.trim()) {
    const { data: school } = await supabase.from("schools").select("id").eq("code", schoolCode.trim().toLowerCase()).maybeSingle();
    if (!school) return notFound; // same generic answer as an unknown ID — no way to probe which codes exist
    query = query.eq("school_id", school.id);
  }

  const { data: matches } = await query.limit(2);

  if (!matches || matches.length === 0 || !matches[0].email) return notFound;
  if (matches.length > 1) {
    return NextResponse.json({ error: "Please sign in from your school's own link." }, { status: 409 });
  }

  return NextResponse.json({ email: matches[0].email });
}
