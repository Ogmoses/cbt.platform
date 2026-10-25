"use client";

/**
 * ExamRoster — who's taken this exam, who's mid-exam, who hasn't
 * started. Scoped to one exam's class by construction (exams.class_id
 * is a single class), so there's no separate class picker here — the
 * class is just whichever one this exam belongs to.
 */

import { X, CheckCircle2, Circle, Clock, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";

export type RosterStatus = "not_started" | "active" | "submitted" | "expired" | "terminated";

export interface RosterStudent {
  id: string;
  fullName: string;
  admissionNumber: string | null;
  status: RosterStatus;
  score: number | null;
  maxScore: number | null;
}

interface ExamRosterProps {
  examTitle: string;
  className: string;
  students: RosterStudent[];
  onClose: () => void;
  /** Only meaningful for "submitted" students — there's nothing to review before that. */
  onSelectStudent?: (studentId: string) => void;
  /** Student whose review is currently loading — shows a spinner on that row and blocks other taps. */
  loadingStudentId?: string | null;
  /** Shown above the list if opening a student's review failed. */
  errorMessage?: string | null;
}

const STATUS_META: Record<RosterStatus, { label: string; icon: React.ElementType; color: string }> = {
  submitted: { label: "Submitted", icon: CheckCircle2, color: "text-success" },
  active: { label: "In progress", icon: Clock, color: "text-crimson-600" },
  not_started: { label: "Not started", icon: Circle, color: "text-ink/35 dark:text-white/35" },
  expired: { label: "Timed out", icon: AlertTriangle, color: "text-warning" },
  terminated: { label: "Terminated", icon: AlertTriangle, color: "text-crimson-600" },
};

/** Statuses that have an attempt worth reviewing (anything the student actually sat). */
const REVIEWABLE: RosterStatus[] = ["submitted", "expired", "terminated"];

const GROUP_ORDER: RosterStatus[] = ["submitted", "active", "not_started", "expired", "terminated"];

export default function ExamRoster({ examTitle, className, students, onClose, onSelectStudent, loadingStudentId, errorMessage }: ExamRosterProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white dark:bg-[#1A1C20] shadow-card-hover">
        <div className="flex items-start justify-between border-b border-black/5 dark:border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">{examTitle}</h2>
            <p className="mt-0.5 text-[12px] text-ink/50 dark:text-white/50">{className} · {students.length} student{students.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {onSelectStudent && students.some((s) => REVIEWABLE.includes(s.status)) && (
            <p className="mb-3 text-[12px] text-ink/50 dark:text-white/50">Tap a student to see which questions they got right and wrong.</p>
          )}
          {errorMessage && <p className="mb-3 rounded-md bg-crimson-50 px-3 py-2 text-[12.5px] text-crimson-700 dark:bg-crimson-600/15 dark:text-crimson-500">{errorMessage}</p>}
          {students.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink/45 dark:text-white/45">No students found in this class yet.</p>
          ) : (
            GROUP_ORDER.map((status) => {
              const group = students.filter((s) => s.status === status);
              if (group.length === 0) return null;
              const meta = STATUS_META[status];
              const Icon = meta.icon;
              return (
                <div key={status} className="mb-4 last:mb-0">
                  <p className={`mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide ${meta.color}`}>
                    <Icon size={13} /> {meta.label} ({group.length})
                  </p>
                  <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10">
                    {group
                      .sort((a, b) => a.fullName.localeCompare(b.fullName))
                      .map((s) => {
                        const clickable = REVIEWABLE.includes(status) && !!onSelectStudent;
                        const Row = (
                          <>
                            <div>
                              <p className="text-[13px] font-medium text-ink dark:text-white">{s.fullName}</p>
                              {s.admissionNumber && <p className="text-[11px] text-ink/40 dark:text-white/40">{s.admissionNumber}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {s.score !== null && s.maxScore !== null && (
                                <span className="text-[12.5px] font-semibold tabular-nums text-ink/70 dark:text-white/70">{s.score}/{s.maxScore}</span>
                              )}
                              {clickable && (loadingStudentId === s.id ? <Loader2 size={14} className="animate-spin text-crimson-600" /> : <ChevronRight size={14} className="text-ink/30 dark:text-white/30" />)}
                            </div>
                          </>
                        );
                        return clickable ? (
                          <button
                            key={s.id}
                            onClick={() => onSelectStudent!(s.id)}
                            disabled={!!loadingStudentId}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-background-muted disabled:opacity-60 dark:hover:bg-white/5"
                          >
                            {Row}
                          </button>
                        ) : (
                          <div key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                            {Row}
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
