"use client";

/**
 * Teacher Overview — landing page after a teacher signs in. Was entirely
 * missing before this: the sidebar linked here and the login flow
 * redirected here, but the route didn't exist, so every teacher hit a 404
 * the moment they signed in.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileQuestion, BookOpen, ClipboardList, BarChart3 } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageLoading from "@/components/layout/PageLoading";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser, signOutAndRedirect } from "@/lib/useAuthUser";

interface TodayBatch {
  id: string;
  examTitle: string;
  batchLabel: string;
  startsAt: string;
  endsAt: string;
  studentCount: number;
}

export default function TeacherOverviewPage() {
  const router = useRouter();
  const authUser = useAuthUser();
  const supabase = createClient();

  const [subjectCount, setSubjectCount] = useState(0);
  const [examCount, setExamCount] = useState(0);
  const [pendingGradingCount, setPendingGradingCount] = useState(0);
  const [todayBatches, setTodayBatches] = useState<TodayBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [{ data: assignmentRows }, { data: examRows }, { data: pendingRows }, { data: batchRows }] = await Promise.all([
        supabase.from("teacher_subjects").select("subject_id").eq("teacher_id", authUser.id),
        supabase.from("exams").select("id").eq("created_by", authUser.id),
        supabase
          .from("student_answers")
          .select("id, questions!inner(type), student_exam_sessions!inner(exam_id, exams!inner(created_by))")
          .is("points_awarded", null)
          .in("questions.type", ["fill_blank", "short_theory"])
          .eq("student_exam_sessions.exams.created_by", authUser.id),
        supabase
          .from("exam_batches")
          .select("id, label, starts_at, ends_at, exams!inner(title, created_by)")
          .eq("exams.created_by", authUser.id)
          .gte("starts_at", todayStart.toISOString())
          .lte("starts_at", todayEnd.toISOString()),
      ]);

      setSubjectCount(new Set((assignmentRows ?? []).map((r) => r.subject_id)).size);
      setExamCount((examRows ?? []).length);
      setPendingGradingCount((pendingRows ?? []).length);

      const batchIds = (batchRows ?? []).map((b) => b.id);
      const { data: studentCountRows } = batchIds.length ? await supabase.from("batch_students").select("batch_id").in("batch_id", batchIds) : { data: [] };
      const countByBatch = new Map<string, number>();
      for (const row of studentCountRows ?? []) countByBatch.set(row.batch_id, (countByBatch.get(row.batch_id) ?? 0) + 1);

      setTodayBatches(
        (batchRows ?? []).map((b: any) => ({
          id: b.id,
          examTitle: b.exams.title,
          batchLabel: b.label,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          studentCount: countByBatch.get(b.id) ?? 0,
        }))
      );
      setLoading(false);
    })();
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout role="teacher" pageTitle="Overview" userName={authUser?.fullName ?? ""} onLogout={() => signOutAndRedirect(router)}>
      {loading ? (
        <PageLoading />
      ) : (
        <div className="pb-10">
          <h1 className="font-display text-[18px] font-semibold text-ink dark:text-white sm:text-[20px]">Welcome back{authUser?.fullName ? `, ${authUser.fullName.trim().split(/\s+/).pop()}` : ""}</h1>
          <p className="mt-0.5 text-[13px] text-ink/50 dark:text-white/50">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatCard icon={BookOpen} label="Subjects" value={subjectCount} />
            <StatCard icon={FileQuestion} label="Exams created" value={examCount} />
            <StatCard icon={ClipboardList} label="Pending grading" value={pendingGradingCount} tone={pendingGradingCount > 0 ? "warn" : "default"} />
          </div>

          <div className="mt-6">
            <h2 className="mb-3 font-display text-[15px] font-semibold text-ink dark:text-white">Today's batches for your exams</h2>
            {todayBatches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-black/10 bg-white px-4 py-8 text-center text-[13px] text-ink/45 dark:border-white/15 dark:bg-[#1A1C20] dark:text-white/45">
                Nothing scheduled today.
              </div>
            ) : (
              <div className="divide-y divide-black/5 rounded-lg border border-black/5 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-[#1A1C20]">
                {todayBatches.map((b) => (
                  <div key={b.id} className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5">
                    <div className="w-16 shrink-0 text-[12px] font-semibold tabular-nums text-ink/60 dark:text-white/60">
                      {formatTime(b.startsAt)}–{formatTime(b.endsAt)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink dark:text-white">{b.examTitle}</p>
                      <p className="text-[12px] text-ink/50 dark:text-white/50">{b.batchLabel}</p>
                    </div>
                    <span className="shrink-0 text-[12px] text-ink/45 dark:text-white/45">{b.studentCount} students</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickLink href="/teacher/questions" icon={FileQuestion} label="Question Bank" />
            <QuickLink href="/teacher/exams" icon={BookOpen} label="My Exams" />
            <QuickLink href="/teacher/grading" icon={ClipboardList} label="Grading Queue" />
            <QuickLink href="/teacher/analytics" icon={BarChart3} label="Class Analytics" />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function StatCard({ icon: Icon, label, value, tone = "default" }: { icon: React.ElementType; label: string; value: number; tone?: "warn" | "default" }) {
  return (
    <div className="rounded-lg border border-black/5 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#1A1C20]">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-md ${tone === "warn" ? "bg-crimson-50 text-crimson-700 dark:bg-crimson-600/15 dark:text-crimson-500" : "bg-background-muted text-ink/60 dark:bg-white/5 dark:text-white/60"}`}>
        <Icon size={16} />
      </div>
      <p className="font-display text-[19px] font-semibold text-ink dark:text-white">{value}</p>
      <p className="text-[11.5px] text-ink/45 dark:text-white/45">{label}</p>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 rounded-lg border border-black/5 bg-white p-4 text-center shadow-card transition-shadow duration-200 hover:shadow-card-hover dark:border-white/10 dark:bg-[#1A1C20]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-crimson-50 text-crimson-700 dark:bg-crimson-600/15 dark:text-crimson-500">
        <Icon size={17} />
      </div>
      <span className="text-[12px] font-medium text-ink/75 dark:text-white/75">{label}</span>
    </Link>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
