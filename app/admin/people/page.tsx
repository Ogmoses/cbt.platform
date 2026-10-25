"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PeopleManager from "@/components/admin/PeopleManager";
import { createClient } from "@/lib/supabase/client";
import { orThrow } from "@/lib/supabaseErrors";
import { useAuthUser, signOutAndRedirect } from "@/lib/useAuthUser";
import type { ImportRow } from "@/components/admin/BulkImportModal";
import type { PersonRole, PersonRow } from "@/components/admin/types";
import PageLoading from "@/components/layout/PageLoading";

export default function AdminPeoplePage() {
  const router = useRouter();
  const authUser = useAuthUser();
  const supabase = createClient();

  const [students, setStudents] = useState<PersonRow[]>([]);
  const [teachers, setTeachers] = useState<PersonRow[]>([]);
  const [classOptions, setClassOptions] = useState<{ id: string; name: string }[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    const [{ data: users }, { data: classes }, { data: subjects }, { data: teacherSubjectRows }] = await Promise.all([
      supabase.from("users").select("id, role, full_name, email, admission_number, staff_id, class_id, is_active").in("role", ["student", "teacher"]),
      supabase.from("classes").select("id, name"),
      supabase.from("subjects").select("id, name"),
      supabase.from("teacher_subjects").select("teacher_id, subject_id, class_id, subjects(name)"),
    ]);

    const assignmentsByTeacher = new Map<string, { subjectId: string; classId: string }[]>();
    const subjectNamesByTeacher = new Map<string, Set<string>>();
    for (const row of teacherSubjectRows ?? []) {
      const list = assignmentsByTeacher.get(row.teacher_id) ?? [];
      list.push({ subjectId: row.subject_id, classId: row.class_id });
      assignmentsByTeacher.set(row.teacher_id, list);

      const names = subjectNamesByTeacher.get(row.teacher_id) ?? new Set<string>();
      names.add((row as any).subjects?.name ?? "");
      subjectNamesByTeacher.set(row.teacher_id, names);
    }

    const toRow = (u: any): PersonRow => ({
      id: u.id,
      role: u.role,
      fullName: u.full_name,
      email: u.email,
      admissionNumber: u.admission_number ?? undefined,
      staffId: u.staff_id ?? undefined,
      classId: u.class_id ?? undefined,
      assignments: assignmentsByTeacher.get(u.id),
      subjectNames: subjectNamesByTeacher.get(u.id) ? [...subjectNamesByTeacher.get(u.id)!] : undefined,
      isActive: u.is_active,
    });

    setStudents((users ?? []).filter((u) => u.role === "student").map(toRow));
    setTeachers((users ?? []).filter((u) => u.role === "teacher").map(toRow));
    setClassOptions(classes ?? []);
    setSubjectOptions(subjects ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncTeacherSubjects = async (teacherId: string, assignments?: { subjectId: string; classId: string }[]) => {
    await orThrow(supabase.from("teacher_subjects").delete().eq("teacher_id", teacherId));
    if (assignments && assignments.length > 0) {
      await orThrow(supabase.from("teacher_subjects").insert(assignments.map((a) => ({ teacher_id: teacherId, subject_id: a.subjectId, class_id: a.classId }))));
    }
  };

  const handleCreate = async (role: PersonRole, person: Omit<PersonRow, "id" | "isActive" | "subjectNames">) => {
    const res = await fetch("/api/admin/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, fullName: person.fullName, email: person.email, admissionNumber: person.admissionNumber, staffId: person.staffId, classId: person.classId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't create that account.");
    if (role === "teacher") await syncTeacherSubjects(data.id, person.assignments);
    await loadAll();
    return { invited: data.invited as boolean | undefined };
  };

  const handleUpdate = async (role: PersonRole, id: string, person: Omit<PersonRow, "id" | "isActive" | "subjectNames">) => {
    const res = await fetch("/api/admin/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fullName: person.fullName, email: person.email, admissionNumber: person.admissionNumber, staffId: person.staffId, classId: person.classId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't update that account.");
    if (role === "teacher") await syncTeacherSubjects(id, person.assignments);
    await loadAll();
  };

  const handleToggleActive = async (_role: PersonRole, id: string, isActive: boolean) => {
    const res = await fetch("/api/admin/people", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isActive }) });
    if (!res.ok) throw new Error("Couldn't update that account.");
    await loadAll();
  };

  const handleDelete = async (_role: PersonRole, id: string) => {
    const res = await fetch("/api/admin/people", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error("Couldn't delete that account.");
    await loadAll();
  };

  const handleResendAccess = async (email: string) => {
    const res = await fetch("/api/admin/people/resend-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't resend access.");
    }
  };

  const handleBulkImport = async (role: PersonRole, rows: ImportRow[]) => {
    const res = await fetch("/api/admin/people/bulk-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, rows }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "The import failed.");
    await loadAll();
    // Per-row results (same order as `rows`) go back to BulkImportModal,
    // which lists exactly which rows failed and why, and retries only those.
    return { results: data.results as { ok: boolean; error?: string }[] };
  };

  return (
    <DashboardLayout role="super_admin" pageTitle="Students & Teachers" userName={authUser?.fullName ?? ""} onLogout={() => signOutAndRedirect(router)}>
      {loading ? <PageLoading /> : (
        <PeopleManager
          classOptions={classOptions}
          subjectOptions={subjectOptions}
          students={students}
          teachers={teachers}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          onResendAccess={handleResendAccess}
          onBulkImport={handleBulkImport}
        />
      )}
    </DashboardLayout>
  );
}
