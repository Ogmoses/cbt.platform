import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchBrandingByCode, fetchOwnSchool, type SchoolBranding } from "@/lib/schoolBranding";

/** Server-side: branding for /s/<code> pages. Works for signed-out visitors. */
export async function getBrandingByCodeServer(code: string): Promise<SchoolBranding | null> {
  const supabase = await createClient();
  return fetchBrandingByCode(supabase, code);
}

/** One sign-in lookup per request, shared by everything below (each lookup is a call to the auth service). */
const getAuthedServer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

/** Server-side: the signed-in user's own school (for the portals), or null. Never throws — a failed lookup just means default styling. */
export const getCurrentSchoolServer = cache(async (): Promise<SchoolBranding | null> => {
  try {
    const { supabase, user } = await getAuthedServer();
    if (!user) return null;
    return await fetchOwnSchool(supabase);
  } catch {
    return null;
  }
});

/**
 * The platform owner's own colors (they belong to no school). Only the owner
 * can read the row, so for anyone else this is simply null.
 */
export const getPlatformThemeServer = cache(async (): Promise<{ themeColor: string; secondaryColor: string } | null> => {
  try {
    const { supabase, user } = await getAuthedServer();
    if (!user) return null;
    const { data } = await supabase.from("platform_settings").select("theme_color, secondary_color").maybeSingle();
    return data ? { themeColor: data.theme_color, secondaryColor: data.secondary_color } : null;
  } catch {
    return null;
  }
});
