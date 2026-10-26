import type { SupabaseClient } from "@supabase/supabase-js";
import { themeCssVars, DEFAULT_THEME_COLOR, isValidHex } from "@/lib/themes";

/**
 * One school's identity and look — replaces the old single-row
 * `school_profile`. Comes from the `schools` table (signed-in users, via
 * RLS: you can only ever read your own school) or from the
 * `get_school_branding(code)` function (signed-out login pages).
 */
export type SchoolStatus = "pending" | "active" | "suspended";

export interface SchoolBranding {
  id: string;
  code: string;
  status: SchoolStatus;
  name: string;
  logoUrl: string | null;
  themeColor: string;
  secondaryColor: string;
  motto: string | null;
  address: string | null;
}

export const DEFAULT_SECONDARY_COLOR = "#fff7d3";

interface SchoolRow {
  id: string;
  code: string;
  status: SchoolStatus;
  name: string | null;
  logo_url: string | null;
  theme_color: string | null;
  secondary_color: string | null;
  motto: string | null;
  address: string | null;
}

function rowToBranding(row: SchoolRow): SchoolBranding {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    name: row.name ?? "",
    logoUrl: row.logo_url,
    themeColor: row.theme_color && isValidHex(row.theme_color) ? row.theme_color : DEFAULT_THEME_COLOR,
    secondaryColor: row.secondary_color && isValidHex(row.secondary_color) ? row.secondary_color : DEFAULT_SECONDARY_COLOR,
    motto: row.motto,
    address: row.address,
  };
}

/** "#fff7d3" -> "255 247 211" — the channel format Tailwind's rgb(var(--x) / <alpha-value>) needs. */
function hexToChannels(hex: string): string {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

/**
 * Every CSS variable a school's branding sets on :root.
 *   --color-crimson-50…900, --color-on-crimson : the existing accent ramp
 *       (what `bg-crimson-600` etc. already use — nothing to rename)
 *   --color-primary / --color-primary-rgb       : the school's main color
 *   --color-secondary / --color-secondary-rgb   : the page surface color
 */
export function brandingCssVars(b: Pick<SchoolBranding, "themeColor" | "secondaryColor">): Record<string, string> {
  const vars: Record<string, string> = {};
  // themeCssVars() returns "--a: 1 2 3; --b: 4 5 6;" — reuse it as-is so the
  // ramp and the WCAG contrast logic stay in one place (lib/themes.ts).
  for (const m of themeCssVars(b.themeColor).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  vars["--color-primary"] = b.themeColor;
  vars["--color-primary-rgb"] = hexToChannels(b.themeColor);
  vars["--color-secondary"] = b.secondaryColor;
  vars["--color-secondary-rgb"] = hexToChannels(b.secondaryColor);
  return vars;
}

/** The same variables as a `:root { … }` block, for server-rendered <style> (no flash of the wrong colors). */
export function brandingStyleText(b: Pick<SchoolBranding, "themeColor" | "secondaryColor">): string {
  const body = Object.entries(brandingCssVars(b))
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
  return `:root { ${body} }`;
}

/** Applies the variables to the live page (used when the signed-in user's school becomes known). */
export function applyBrandingVars(b: Pick<SchoolBranding, "themeColor" | "secondaryColor">) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(brandingCssVars(b))) root.style.setProperty(k, v);
}

/** Signed-out lookup by the code in the URL (/s/<code>). Returns null if no such school. */
export async function fetchBrandingByCode(supabase: SupabaseClient, code: string): Promise<SchoolBranding | null> {
  const { data, error } = await supabase.rpc("get_school_branding", { p_code: code });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return rowToBranding(row as SchoolRow);
}

/** The signed-in user's own school. Null for the platform owner (who belongs to no school) or when signed out. */
export async function fetchOwnSchool(supabase: SupabaseClient): Promise<SchoolBranding | null> {
  const { data: schoolId } = await supabase.rpc("get_user_school_id");
  if (!schoolId) return null;
  const { data } = await supabase
    .from("schools")
    .select("id, code, status, name, logo_url, theme_color, secondary_color, motto, address")
    .eq("id", schoolId as string)
    .maybeSingle();
  return data ? rowToBranding(data as SchoolRow) : null;
}
