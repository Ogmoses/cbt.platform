"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSchool } from "@/components/SchoolProvider";
import { fetchBrandingByCode, type SchoolBranding } from "@/lib/schoolBranding";

export interface SchoolProfile {
  name: string;
  motto: string | null;
  logoUrl: string | null;
}

const FALLBACK: SchoolProfile = { name: "CBT Platform", motto: null, logoUrl: null };

/** "Soaring Fountain Group of Schools" -> "SFGS" — for example placeholders like a student/staff ID format. */
export function schoolAcronym(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return letters || "SCH";
}

/** "Soaring Fountain Group of Schools" -> "soaringfountaingroupofschools" — for an example email domain placeholder. */
export function schoolSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug || "school";
}

/**
 * The current school's name / motto / logo, for headers, login and
 * set-password screens. It comes from the school-aware context (see
 * components/SchoolProvider.tsx): the signed-in user's own school, or the
 * school in the /s/<code> link. For signed-out pages reached by an emailed
 * link (set / reset password), pass the school code carried in that link.
 * Falls back to a generic label — never another school's name — if nothing
 * is known yet.
 */
export function useSchoolProfile(code?: string | null): SchoolProfile {
  const { school } = useSchool();
  const [byCode, setByCode] = useState<SchoolBranding | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    fetchBrandingByCode(createClient(), code).then((found) => {
      if (!cancelled && found && found.status === "active") setByCode(found);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const source = byCode ?? school;
  return source ? { name: source.name || FALLBACK.name, motto: source.motto, logoUrl: source.logoUrl } : FALLBACK;
}
