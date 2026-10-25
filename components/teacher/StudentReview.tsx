"use client";

/**
 * StudentReview — a teacher's view into one student's completed attempt:
 * every question, what they answered, whether it was right, and whether
 * they flagged it while taking the exam (student_answers.is_flagged —
 * captured at submit time, but nothing previously surfaced it anywhere in
 * the teacher UI).
 *
 * Opened from ExamRoster by tapping a "Submitted" student.
 */

import { useMemo, useState } from "react";
import { X, Flag, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import type { StudentReviewQuestion } from "./types";
import MathText from "@/components/common/MathText";

interface StudentReviewProps {
  studentName: string;
  examTitle: string;
  totalScore: number;
  maxScore: number;
  questions: StudentReviewQuestion[];
  onClose: () => void;
}

/** Objective types have a clear right/wrong; fill_blank/short_theory are graded on a point scale, not strictly binary. */
function correctness(q: StudentReviewQuestion): "correct" | "incorrect" | "partial" | "ungraded" {
  if (q.type === "multiple_choice" || q.type === "true_false") {
    if (q.selectedOptionId == null) return "incorrect"; // left blank
    const chosen = q.options?.find((o) => o.id === q.selectedOptionId);
    return chosen?.isCorrect ? "correct" : "incorrect";
  }
  if (q.pointsAwarded == null) return "ungraded";
  if (q.pointsAwarded <= 0) return "incorrect";
  if (q.pointsAwarded >= q.maxPoints) return "correct";
  return "partial";
}

const CORRECTNESS_META = {
  correct: { icon: CheckCircle2, color: "text-success", label: "Correct" },
  incorrect: { icon: XCircle, color: "text-crimson-600", label: "Incorrect" },
  partial: { icon: HelpCircle, color: "text-warning", label: "Partial credit" },
  ungraded: { icon: HelpCircle, color: "text-ink/35 dark:text-white/35", label: "Not yet graded" },
};

type ReviewFilter = "all" | "incorrect" | "correct" | "other";

export default function StudentReview({ studentName, examTitle, totalScore, maxScore, questions, onClose }: StudentReviewProps) {
  const flaggedCount = questions.filter((q) => q.isFlagged).length;
  const [filter, setFilter] = useState<ReviewFilter>("all");

  // Question numbers stay as they were in the exam even when filtered, so
  // "Question 7" always means the 7th question the student saw.
  const numbered = useMemo(() => questions.map((q, i) => ({ q, number: i + 1, state: correctness(q) })), [questions]);
  const counts = useMemo(
    () => ({
      all: numbered.length,
      incorrect: numbered.filter((n) => n.state === "incorrect").length,
      correct: numbered.filter((n) => n.state === "correct").length,
      other: numbered.filter((n) => n.state === "partial" || n.state === "ungraded").length, // partial credit / theory not yet graded
    }),
    [numbered]
  );
  const visible = numbered.filter((n) => filter === "all" || (filter === "other" ? n.state === "partial" || n.state === "ungraded" : n.state === filter));

  const chips: { key: ReviewFilter; label: string; show: boolean }[] = [
    { key: "all", label: "All", show: true },
    { key: "incorrect", label: "Wrong", show: true },
    { key: "correct", label: "Correct", show: true },
    { key: "other", label: "Partial / ungraded", show: counts.other > 0 },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white dark:bg-[#1A1C20] shadow-card-hover">
        <div className="flex items-start justify-between border-b border-black/5 dark:border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">{studentName}</h2>
            <p className="mt-0.5 text-[12px] text-ink/50 dark:text-white/50">
              {examTitle} · {totalScore}/{maxScore}
              {flaggedCount > 0 && <span className="text-crimson-600"> · {flaggedCount} flagged by student</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {questions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-black/5 px-5 py-2.5 dark:border-white/10">
            {chips.filter((c) => c.show).map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors duration-200 ${
                  filter === c.key ? "bg-crimson-600 text-on-crimson" : "bg-background-muted text-ink/60 hover:bg-black/5 dark:bg-white/5 dark:text-white/60"
                }`}
              >
                {c.label} ({counts[c.key]})
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {questions.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink/45 dark:text-white/45">No answers found for this attempt.</p>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink/45 dark:text-white/45">No questions in this group.</p>
          ) : (
            visible.map(({ q, number: i0, state }) => {
              const i = i0 - 1;
              const meta = CORRECTNESS_META[state];
              const Icon = meta.icon;
              return (
                <div
                  key={q.questionId}
                  className={`rounded-lg border p-3.5 ${q.isFlagged ? "border-crimson-200 bg-crimson-50/40 dark:bg-crimson-600/10" : "border-black/10 dark:border-white/15"}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40 dark:text-white/40">Question {i + 1}</p>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {q.isFlagged && (
                        <span className="flex items-center gap-1 rounded-full bg-crimson-100 px-2 py-0.5 text-[11px] font-medium text-crimson-700 dark:text-crimson-500">
                          <Flag size={11} /> Flagged
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-[11.5px] font-medium ${meta.color}`}>
                        <Icon size={13} /> {meta.label}
                      </span>
                    </div>
                  </div>

                  <MathText text={q.prompt} className="mb-2.5 block text-[13.5px] leading-relaxed text-ink dark:text-white" />

                  {(q.type === "multiple_choice" || q.type === "true_false") && q.options ? (
                    <div className="space-y-1.5">
                      {q.options.map((opt) => {
                        const isSelected = opt.id === q.selectedOptionId;
                        return (
                          <div
                            key={opt.id}
                            className={`rounded-md border px-3 py-1.5 text-[12.5px] ${
                              opt.isCorrect
                                ? "border-success/40 bg-success/10 text-ink dark:text-white"
                                : isSelected
                                ? "border-crimson-300 bg-crimson-50 dark:bg-crimson-600/15 text-crimson-800"
                                : "border-black/10 dark:border-white/15 text-ink/60 dark:text-white/60"
                            }`}
                          >
                            <MathText text={opt.text} />
                            {opt.isCorrect && <span className="ml-1.5 text-[11px] font-medium text-success">(correct answer)</span>}
                            {isSelected && !opt.isCorrect && <span className="ml-1.5 text-[11px] font-medium text-crimson-600">(student's answer)</span>}
                            {isSelected && opt.isCorrect && <span className="ml-1.5 text-[11px] font-medium text-success">(student's answer)</span>}
                          </div>
                        );
                      })}
                      {q.selectedOptionId == null && <p className="text-[12px] italic text-ink/40 dark:text-white/40">Student left this blank.</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-md bg-crimson-50 dark:bg-crimson-600/15 px-3 py-2 text-[12.5px] text-ink dark:text-on-crimson">
                        <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-crimson-700 dark:text-crimson-500/70">Student's answer</span>
                        <MathText text={q.freeTextAnswer?.trim() || "— left blank —"} className="block whitespace-pre-wrap" />
                      </div>
                      {q.referenceAnswer && (
                        <div className="rounded-md bg-background-muted dark:bg-white/5 px-3 py-2 text-[12.5px] text-ink/75 dark:text-white/75">
                          <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/40 dark:text-white/40">
                            {q.type === "fill_blank" ? "Expected answer" : "Marking guide"}
                          </span>
                          <MathText text={q.referenceAnswer} className="block whitespace-pre-wrap" />
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-2 text-right text-[12px] font-medium tabular-nums text-ink/50 dark:text-white/50">
                    {q.pointsAwarded ?? 0}/{q.maxPoints} pts
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
