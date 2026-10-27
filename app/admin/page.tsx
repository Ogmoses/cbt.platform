"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminOverview from "@/components/admin/AdminOverview";
import { createClient } from "@/lib/supabase/client";
import { useSchoolProfile } from "@/lib/useSchoolProfile";
import { useAuthUser, signOutAndRedirect } from "@/lib/useAuthUser";
import type { AdminStats, TodayBatch } from "@/components/admin/types";
import PageLoading from "@/components/layout/PageLoading";

/** Two batches conflict if they share a lab room and their time windows overlap. */
function findConflicts(batches: TodayBatch[]): string[] {
  const byRoom = new Map<string, TodayBatch[]>();
  for (const b of batches) {
    if (!b.labRoom) continue;
    byRoom.set(b.labRoom, [...(byRoom.get(b.labRoom) ?? []), b]);
  }
  const conflictIds = new Set<string>();
  for (const group of byRoom.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const overlap = new Date(a.startsAt) < new Date(b.endsAt) && new Date(a.endsAt) > new Date(b.startsAt);
        if (overlap) {
          conflictIds.add(a.id);
          conflictIds.add(b.id);
        }
      }
    }
  }
  return [...conflictIds];
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const authUser = useAuthUser();
  const supabase = createClient();

  const school = useSchoolProfile();
  const [stats, setStats] = useState<AdminStats>({ totalStudents: 0, totalTeachers: 0, totalClasses: 0, examsToday: 0 });
  const [todayBatches, setTodayBatches] = useState<TodayBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [{ count: totalStudents }, { count: totalTeachers }, { count: totalClasses }, { data: batchRows }] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase
          .from("exam_batches")
          .select("id, label, starts_at, ends_at, lab_room, exams(title, subjects(name), classes(name))")
          .gte("starts_at", todayStart.toISOString())
          .lte("starts_at", todayEnd.toISOString()),
      ]);

      const batchIds = (batchRows ?? []).map((b) => b.id);
      const { data: batchStudentRows } = batchIds.length ? await supabase.from("batch_students").select("batch_id").in("batch_id", batchIds) : { data: [] };
      const countByBatch = new Map<string, number>();
      for (const row of batchStudentRows ?? []) countByBatch.set(row.batch_id, (countByBatch.get(row.batch_id) ?? 0) + 1);

      const batches: TodayBatch[] = (batchRows ?? []).map((b: any) => ({
        id: b.id,
        examTitle: b.exams?.title ?? "",
        subjectName: b.exams?.subjects?.name ?? "",
        className: b.exams?.classes?.name ?? "",
        batchLabel: b.label,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        labRoom: b.lab_room ?? undefined,
        studentCount: countByBatch.get(b.id) ?? 0,
      }));

      setTodayBatches(batches);
      setStats({ totalStudents: totalStudents ?? 0, totalTeachers: totalTeachers ?? 0, totalClasses: totalClasses ?? 0, examsToday: batches.length });
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout role="super_admin" pageTitle="Overview" userName={authUser?.fullName ?? ""} onLogout={() => signOutAndRedirect(router)}>
      {loading ? <PageLoading /> : (
        <AdminOverview schoolName={school.name} stats={stats} todayBatches={todayBatches} conflictBatchIds={findConflicts(todayBatches)} />
      )}
    </DashboardLayout>
  );
}
