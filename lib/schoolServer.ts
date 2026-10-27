import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchBrandingByCode, fetchOwnSchool, type SchoolBranding } from "@/lib/schoolBranding";

/** Server-side: branding for /s/<code> pages. Works for signed-out visitors. */
export async function getBrandingByCodeServer(code: string): Promise<SchoolBranding | null> {
  const supabase = await createClient();
  return fetchBrandingByCode(supabase, code);
}

/** Server-side: the signed-in user's own school (for the portals), or null. Never throws — a failed lookup just means default styling. */
export const getCurrentSchoolServer = cache(async (): Promise<SchoolBranding | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return await fetchOwnSchool(supabase);
  } catch {
    return null;
  }
});
