"use client";

import { useRouter } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { createClient } from "@/lib/supabase/client";
import { deriveStudentPassword } from "@/lib/studentCredential";
import { roleHome } from "@/lib/roleHome";
import { useSchool } from "@/components/SchoolProvider";

/**
 * The sign-in screen, used by both /login (the original address, which keeps
 * working) and /s/<code> (each school's own link). With a `schoolCode`, a
 * student's ID is looked up only within that school — so two schools can both
 * have a student "001" — and the page shows that school's branding.
 */
export default function SchoolLogin({ schoolCode }: { schoolCode?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { school } = useSchool();

  const handleStudentLogin = async (fullName: string, studentId: string) => {
    // Student IDs aren't emails, and Supabase Auth signs in by email —
    // resolve it server-side first (there's no session yet to query with).
    const res = await fetch("/api/auth/resolve-student-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, schoolCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "We couldn't find that student ID.");

    const password = deriveStudentPassword(fullName, studentId);
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password });
    if (error) throw new Error("Your name and student ID didn't match what's on file. Double-check both and try again.");
    router.push("/student");
  };

  const handleStaffLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Incorrect email or password.");

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("users").select("role").eq("id", auth.user!.id).single();
    router.push(roleHome(profile?.role));
  };

  return (
    <LoginForm
      onStudentLogin={handleStudentLogin}
      onStaffLogin={handleStaffLogin}
      school={schoolCode && school ? { name: school.name, motto: school.motto, logoUrl: school.logoUrl } : undefined}
    />
  );
}
