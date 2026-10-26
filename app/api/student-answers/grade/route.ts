import { NextRequest, NextResponse } from "next/server";
import { getCallerContext } from "@/lib/auth/callerContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGradeLetter } from "@/lib/grading";

/**
 * POST /api/student-answers/grade
 * body: { answerId: string, pointsAwarded: number, feedback?: string }
 *
 * Records a teacher's manual mark for one short_theory (or reviewed
 * fill_blank) answer. Once every answer in that session has a score —
 * auto-graded ones already do, from /api/exam-sessions/submit — this
 * rolls the theory score into the exam's `results` row and assigns the
 * final grade letter from `grading_scale`.
 *
 * Uses the admin client for every read/write below: `student_answers` and
 * `student_exam_sessions` only have RLS policies for a student reading
 * their *own* rows, so a teacher grading someone else's answer would
 * otherwise have every query here silently return nothing/update zero
 * rows under RLS — no error, just data that never actually saves. The
 * role check right below is what stands in for RLS on this route.
 */
export async function POST(req: NextRequest) {
  const { answerId, pointsAwarded, feedback } = await req.json();
  if (!answerId || typeof pointsAwarded !== "number") {
    return NextResponse.json({ error: "answerId and pointsAwarded are required." }, { status: 400 });
  }

  const guard = await getCallerContext({ roles: ["teacher", "super_admin"], forbiddenMessage: "Only teachers can grade answers." });
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { ctx } = guard;

  const admin = createAdminClient();

  // Scoped to the grader's school: an answer id from another school isn't found.
  const { data: answer } = await admin.from("student_answers").select("id, session_id").eq("id", answerId).eq("school_id", ctx.schoolId).maybeSingle();
  if (!answer) return NextResponse.json({ error: "Answer not found." }, { status: 404 });

  await admin
    .from("student_answers")
    .update({ points_awarded: pointsAwarded, feedback: feedback ?? null, graded_by: ctx.userId, graded_at: new Date().toISOString() })
    .eq("id", answerId)
    .eq("school_id", ctx.schoolId);

  // ---- Check whether the whole session is now fully graded, and if so, roll up the result ----
  const { data: session } = await admin.from("student_exam_sessions").select("id, exam_id, student_id").eq("id", answer.session_id).eq("school_id", ctx.schoolId).maybeSingle();
  if (!session) return NextResponse.json({ ok: true, sessionFullyGraded: false });

  const { data: sessionAnswers } = await admin
    .from("student_answers")
    .select("points_awarded, questions(type, points)")
    .eq("session_id", session.id)
    .eq("school_id", ctx.schoolId);

  const stillPending = (sessionAnswers ?? []).some((a) => a.points_awarded === null);
  if (stillPending) return NextResponse.json({ ok: true, sessionFullyGraded: false });

  const theoryScore = (sessionAnswers ?? [])
    .filter((a: any) => a.questions.type === "short_theory")
    .reduce((sum, a) => sum + (a.points_awarded ?? 0), 0);
  const maxScore = (sessionAnswers ?? []).reduce((sum: number, a: any) => sum + a.questions.points, 0);

  const { data: existingResult } = await admin.from("results").select("objective_score").eq("session_id", session.id).eq("school_id", ctx.schoolId).single();
  const objectiveScore = existingResult?.objective_score ?? 0;
  const totalScore = objectiveScore + theoryScore;

  // This school's OWN scale only — without the filter, every school's bands would be mixed together.
  const { data: scaleRows } = await admin.from("grading_scale").select("min_score, max_score, grade_letter").eq("school_id", ctx.schoolId);
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  const gradeLetter = computeGradeLetter(percentage, (scaleRows ?? []).map((r) => ({ minScore: r.min_score, maxScore: r.max_score, gradeLetter: r.grade_letter })));

  await admin.from("results").update({ theory_score: theoryScore, total_score: totalScore, grade_letter: gradeLetter }).eq("session_id", session.id).eq("school_id", ctx.schoolId);

  return NextResponse.json({ ok: true, sessionFullyGraded: true, totalScore, maxScore, gradeLetter });
}
