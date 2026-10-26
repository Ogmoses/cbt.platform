import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side school name, for emails sent from API routes (invite, reset)
 * where no React component is available. Takes the school's id: there is no
 * longer one global school. A broken lookup falls back to a generic label
 * rather than producing blank branding in an email someone receives.
 */
export async function getSchoolNameServer(admin: SupabaseClient, schoolId: string): Promise<string> {
  const { data } = await admin.from("schools").select("name").eq("id", schoolId).maybeSingle();
  return data?.name || "CBT Platform";
}
