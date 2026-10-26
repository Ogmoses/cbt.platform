"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

export interface AuthUser {
  id: string;
  fullName: string;
  role: "platform_owner" | "super_admin" | "teacher" | "student";
}

/**
 * Reads the signed-in user's profile (from `users`, not just the raw auth
 * session) once on mount. Every dashboard page was using a hardcoded
 * `userName="Mrs. Adeyemi"` placeholder — swap that prop for
 * `authUser?.fullName ?? ""` once wiring a page to this hook.
 */
export function useAuthUser() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || cancelled) return;
      const { data: profile } = await supabase.from("users").select("full_name, role").eq("id", data.user.id).single();
      if (profile && !cancelled) setAuthUser({ id: data.user.id, fullName: profile.full_name, role: profile.role });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return authUser;
}

export async function signOutAndRedirect(router: { push: (href: string) => void }) {
  const supabase = createClient();
  await supabase.auth.signOut();
  router.push("/login");
}
