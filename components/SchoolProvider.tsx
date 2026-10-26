"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyBrandingVars, fetchOwnSchool, type SchoolBranding } from "@/lib/schoolBranding";

interface SchoolContextValue {
  /** The current school's branding, or null while unknown (signed out with no school in the URL, or the platform owner). */
  school: SchoolBranding | null;
  loading: boolean;
  /** Re-reads the signed-in user's school — call after saving school settings so the new logo/colors show instantly. */
  refresh: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextValue>({ school: null, loading: false, refresh: async () => {} });

/**
 * Holds the current tenant's branding and keeps the page's CSS variables in
 * sync with it, so switching school (or saving new colors) restyles the app
 * instantly with no reload.
 *
 * Where the school comes from:
 *  - `initialSchool` from the server: the school in the URL (/s/<code>) on
 *    login pages, or the signed-in user's school in the portals. Rendered
 *    server-side, so there is no flash of default colors.
 *  - once someone is signed in, their own school (RLS guarantees they can
 *    only read their own) — this wins over the URL.
 *  - when they sign out, it falls back to `initialSchool` again.
 */
export function SchoolProvider({ initialSchool = null, children }: { initialSchool?: SchoolBranding | null; children: ReactNode }) {
  const [school, setSchool] = useState<SchoolBranding | null>(initialSchool);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const own = await fetchOwnSchool(createClient());
      setSchool(own ?? initialSchool);
    } finally {
      setLoading(false);
    }
  }, [initialSchool]);

  useEffect(() => {
    const supabase = createClient();
    // Covers a sign-in/out that happens without a full page load.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    if (school) applyBrandingVars(school);
  }, [school]);

  const value = useMemo(() => ({ school, loading, refresh }), [school, loading, refresh]);
  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

/** `const { school } = useSchool();` then `school?.name`, `school?.logoUrl`, … */
export function useSchool(): SchoolContextValue {
  return useContext(SchoolContext);
}
