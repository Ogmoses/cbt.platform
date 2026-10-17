"use client";

/**
 * MyExams — a teacher's own exams: drafts still being built, upcoming
 * ones already scheduled, and ones students have already sat, plus
 * archived ones tucked out of the way. This is the landing view for
 * "My Exams" in the sidebar; creating a new exam is a separate
 * /teacher/exams/new page, not a modal, since ExamBuilder itself is a
 * full multi-section form.
 *
 * Delete vs Archive: deleting an exam cascades to exam_questions,
 * exam_batches, student_exam_sessions, AND results at the database
 * level (see schema.sql) — meaning deleting an exam students have
 * already sat would destroy their submitted work. So real delete is
 * only offered while hasStudentActivity is false; once any student has
 * started or the exam has results, the only option is Archive, which
 * just hides it from the active lists without touching their data.
 */

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Archive, Users, Loader2, FileEdit, CalendarClock, CheckCircle2, Copy } from "lucide-react";
import type { ClassOption } from "./types";

export type ExamListStatus = "draft" | "published" | "archived";

export interface ExamListItem {
  id: string;
  title: string;
  subjectName: string;
  classId: string;
  className: string;
  termName: string;
  status: ExamListStatus;
  isTerminal: boolean;
  batchSummary: string | null; // human-readable date/time range, or null if no batches yet
  latestBatchEndsAt: string | null; // ISO, for the upcoming/completed split
  allStudentsFinished: boolean; // every enrolled student has submitted, expired, or been terminated
  hasStudentActivity: boolean;
  totalStudents: number;
  completedCount: number;
}

interface MyExamsProps {
  exams: ExamListItem[];
  classes: ClassOption[];
  onNew: () => void;
  onEdit: (examId: string) => void;
  onReuse: (examId: string) => void;
  onViewRoster: (examId: string) => void;
  onDelete: (examId: string) => Promise<void>;
  onArchive: (examId: string) => Promise<void>;
}

function ExamRow({ exam, onEdit, onReuse, onViewRoster, onRequestDelete }: {
  exam: ExamListItem;
  onEdit: () => void;
  onReuse: () => void;
  onViewRoster: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13.5px] font-medium text-ink dark:text-white">{exam.title || "Untitled exam"}</p>
          {exam.isTerminal && (
            <span className="shrink-0 rounded-full bg-crimson-50 dark:bg-crimson-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-crimson-600">Terminal</span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-ink/50 dark:text-white/50">
          {exam.className} · {exam.subjectName} · {exam.termName}
          {exam.batchSummary && <> · {exam.batchSummary}</>}
        </p>
        {exam.status === "published" && exam.totalStudents > 0 && (
          <p className="mt-1 text-[11.5px] text-ink/40 dark:text-white/40">{exam.completedCount}/{exam.totalStudents} completed</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {exam.status === "published" && (
          <button
            onClick={onViewRoster}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink/60 dark:text-white/60 hover:bg-background-muted dark:hover:bg-white/5"
            title="View students"
          >
            <Users size={14} /> Students
          </button>
        )}
        {exam.hasStudentActivity ? (
          <button onClick={onReuse} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink/60 dark:text-white/60 hover:bg-background-muted dark:hover:bg-white/5" title="Duplicate into a new exam">
            <Copy size={14} /> Reuse
          </button>
        ) : (
          <button onClick={onEdit} className="rounded-md p-2 text-ink/50 dark:text-white/50 hover:bg-background-muted dark:hover:bg-white/5" title="Edit">
            <Pencil size={15} />
          </button>
        )}
        {exam.status !== "archived" && (
          <button onClick={onRequestDelete} className="rounded-md p-2 text-ink/50 dark:text-white/50 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-600" title={exam.hasStudentActivity ? "Archive" : "Delete"}>
            {exam.hasStudentActivity ? <Archive size={15} /> : <Trash2 size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, exams, emptyHint, ...rowProps }: {
  title: string;
  icon: React.ElementType;
  exams: ExamListItem[];
  emptyHint: string;
  onEdit: (id: string) => void;
  onReuse: (id: string) => void;
  onViewRoster: (id: string) => void;
  onRequestDelete: (exam: ExamListItem) => void;
}) {
  if (exams.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-ink/45 dark:text-white/45">
        <Icon size={13} /> {title} ({exams.length})
      </h2>
      <div className="space-y-2">
        {exams.map((exam) => (
          <ExamRow
            key={exam.id}
            exam={exam}
            onEdit={() => rowProps.onEdit(exam.id)}
            onReuse={() => rowProps.onReuse(exam.id)}
            onViewRoster={() => rowProps.onViewRoster(exam.id)}
            onRequestDelete={() => rowProps.onRequestDelete(exam)}
          />
        ))}
      </div>
      {exams.length === 0 && <p className="text-[12.5px] text-ink/40 dark:text-white/40">{emptyHint}</p>}
    </div>
  );
}

export default function MyExams({ exams, classes, onNew, onEdit, onReuse, onViewRoster, onDelete, onArchive }: MyExamsProps) {
  const [classFilter, setClassFilter] = useState<string>("all");
  const [confirmTarget, setConfirmTarget] = useState<ExamListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => (classFilter === "all" ? exams : exams.filter((e) => e.classId === classFilter)),
    [exams, classFilter]
  );

  const now = Date.now();
  const drafts = filtered.filter((e) => e.status === "draft");
  const upcoming = filtered.filter((e) => e.status === "published" && !e.allStudentsFinished && (!e.latestBatchEndsAt || new Date(e.latestBatchEndsAt).getTime() > now));
  const completed = filtered.filter((e) => e.status === "published" && (e.allStudentsFinished || (e.latestBatchEndsAt && new Date(e.latestBatchEndsAt).getTime() <= now)));
  const archived = filtered.filter((e) => e.status === "archived");

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    setError(null);
    try {
      await (confirmTarget.hasStudentActivity ? onArchive(confirmTarget.id) : onDelete(confirmTarget.id));
      setConfirmTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const rowProps = { onEdit, onReuse, onViewRoster, onRequestDelete: setConfirmTarget };

  return (
    <div className="pb-10">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-[18px] font-semibold text-ink dark:text-white sm:text-[20px]">My exams</h1>
          <p className="mt-0.5 text-[12.5px] text-ink/50 dark:text-white/50">{exams.length} total across your classes</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-crimson-600 px-4 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700"
        >
          <Plus size={16} /> New exam
        </button>
      </div>

      {classes.length > 1 && (
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="mb-5 rounded-lg border border-black/10 dark:border-white/15 px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500"
        >
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/15 py-14 text-center">
          <p className="text-[13px] text-ink/50 dark:text-white/50">No exams yet.</p>
          <button onClick={onNew} className="mt-2 text-[13px] font-medium text-crimson-600 hover:underline">
            Build your first one
          </button>
        </div>
      ) : (
        <>
          <Section title="Drafts" icon={FileEdit} exams={drafts} emptyHint="" {...rowProps} />
          <Section title="Upcoming" icon={CalendarClock} exams={upcoming} emptyHint="" {...rowProps} />
          <Section title="Completed" icon={CheckCircle2} exams={completed} emptyHint="" {...rowProps} />
          <Section title="Archived" icon={Archive} exams={archived} emptyHint="" {...rowProps} />
        </>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] p-5 shadow-card-hover">
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
              {confirmTarget.hasStudentActivity ? "Archive this exam?" : "Delete this exam?"}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink/60 dark:text-white/60">
              {confirmTarget.hasStudentActivity
                ? `${confirmTarget.completedCount} of ${confirmTarget.totalStudents} students have already started or finished "${confirmTarget.title}" — deleting would destroy their submitted work, so this archives it instead. Archived exams are hidden from these lists but nothing is lost, and results stay intact.`
                : `"${confirmTarget.title}" has no student activity yet, so this permanently deletes it — its questions and any scheduled batches go with it. This can't be undone.`}
            </p>
            {error && <p className="mt-2 text-[12.5px] text-crimson-600">{error}</p>}
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={busy}
                className="flex-1 rounded-lg border border-black/10 dark:border-white/15 py-2.5 text-[13px] font-medium text-ink/70 dark:text-white/70 hover:bg-background-muted dark:hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-crimson-600 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700 disabled:opacity-70"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {confirmTarget.hasStudentActivity ? "Archive" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
