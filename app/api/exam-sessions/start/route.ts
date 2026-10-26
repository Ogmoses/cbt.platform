import { NextRequest, NextResponse } from "next/server";
import { getCallerContext } from "@/lib/auth/callerContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { seededShuffle } from "@/lib/shuffle";
import type { AnswersMap, ExamData, ExamQuestion } from "@/components/exam/ExamInterface";

/**
 * POST /api/exam-sessions/start
 * body: { examId: string, batchId: string, deviceFingerprint: string }
 *
 * Verifies the student is allowed into this batch right now, then either
 * creates a fresh session or resumes/reclaims an existing one — this is
 * where "Single Active Session Enforcement" and the batch time-lock both
 * live. Returns the exam payload (shuffled per its settings) plus any
 * previously auto-saved answers, so the client can restore state even if
 * it's a different device than last time.
 *
 * Uses the admin client throughout (after identifying the caller): a
 * student has no RLS read access to `questions`/`question_options` at
 * all (by design — that's what keeps `is_correct` from being queryable
 * directly), so building this payload with the regular client would
 * silently come back with every question's content stripped out. This
 * route's own checks above (batch window, roster, single-session) are
 * the real authorization boundary, not RLS.
 */

// A session on another device is only reclaimable once its autosave
// heartbeat has clearly gone quiet — comfortably more than the 5s
// autosave interval, so a slow network blip doesn't look like a crash.
const STALE_HEARTBEAT_MS = 20_000;

export async function POST(req: NextRequest) {
  const { examId, batchId, deviceFingerprint } = await req.json();
  if (!examId || !batchId || !deviceFingerprint) {
    return NextResponse.json({ error: "examId, batchId, and deviceFingerprint are required." }, { status: 400 });
  }

  const guard = await getCallerContext();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { ctx } = guard;
  const studentId = ctx.userId;

  // Service-role client: it ignores RLS, so EVERY query below is filtered by
  // ctx.schoolId — an exam/batch id from another school simply isn't found.
  const admin = createAdminClient();

  // ---- Exam + batch + roster checks ----
  const { data: exam } = await admin.from("exams").select("id, title, duration_minutes, status, subjects(name)").eq("id", examId).eq("school_id", ctx.schoolId).maybeSingle();
  if (!exam || exam.status !== "published") {
    return NextResponse.json({ error: "This exam isn't available." }, { status: 403 });
  }

  const { data: batch } = await admin.from("exam_batches").select("id, starts_at, ends_at").eq("id", batchId).eq("exam_id", examId).eq("school_id", ctx.schoolId).maybeSingle();
  if (!batch) return NextResponse.json({ error: "Batch not found for this exam." }, { status: 404 });

  const now = new Date();
  if (now < new Date(batch.starts_at) || now > new Date(batch.ends_at)) {
    return NextResponse.json({ error: "This batch's time window isn't open." }, { status: 403 });
  }

  const { data: assignment } = await admin.from("batch_students").select("student_id").eq("batch_id", batchId).eq("student_id", studentId).eq("school_id", ctx.schoolId).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "You aren't assigned to this batch." }, { status: 403 });

  // ---- Single active-session enforcement ----
  const { data: existing } = await admin
    .from("student_exam_sessions")
    .select("id, status, device_fingerprint, last_heartbeat_at")
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();

  let sessionId: string;

  if (!existing) {
    const { data: created, error } = await admin
      .from("student_exam_sessions")
      .insert({ school_id: ctx.schoolId, exam_id: examId, batch_id: batchId, student_id: studentId, status: "active", device_fingerprint: deviceFingerprint })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "Couldn't start the exam session." }, { status: 500 });
    sessionId = created.id;
  } else if (existing.status === "submitted") {
    return NextResponse.json({ error: "You've already submitted this exam." }, { status: 409 });
  } else if (existing.status === "terminated" || existing.status === "expired") {
    return NextResponse.json({ error: "This attempt was closed. Ask your teacher to reset it if you need another attempt." }, { status: 409 });
  } else if (existing.device_fingerprint === deviceFingerprint) {
    // same browser continuing/refreshing — just bump the heartbeat
    await admin.from("student_exam_sessions").update({ last_heartbeat_at: now.toISOString() }).eq("id", existing.id);
    sessionId = existing.id;
  } else {
    const staleMs = now.getTime() - new Date(existing.last_heartbeat_at).getTime();
    if (staleMs < STALE_HEARTBEAT_MS) {
      return NextResponse.json({ error: "This exam is already in progress on another computer." }, { status: 409 });
    }
    // previous device went quiet (crash/power outage) — reclaim the session
    await admin
      .from("student_exam_sessions")
      .update({ device_fingerprint: deviceFingerprint, batch_id: batchId, last_heartbeat_at: now.toISOString() })
      .eq("id", existing.id);
    sessionId = existing.id;
  }

  // ---- Build the exam payload ----
  const { data: examQuestions } = await admin
    .from("exam_questions")
    .select("order_index, questions(id, type, prompt, image_url, points, question_options(id, option_text, order_index))")
    .eq("exam_id", examId)
    .eq("school_id", ctx.schoolId)
    .order("order_index");

  const { data: examSettings } = await admin.from("exams").select("shuffle_questions, shuffle_options").eq("id", examId).eq("school_id", ctx.schoolId).single();

  let questions: ExamQuestion[] = (examQuestions ?? []).map((eq: any) => ({
    id: eq.questions.id,
    type: eq.questions.type,
    prompt: eq.questions.prompt,
    imageUrl: eq.questions.image_url,
    points: eq.questions.points,
    options: eq.questions.question_options
      ?.sort((a: any, b: any) => a.order_index - b.order_index)
      .map((o: any) => ({ id: o.id, text: o.option_text })), // is_correct deliberately not sent to the client
  }));

  if (examSettings?.shuffle_questions) questions = seededShuffle(questions, sessionId);
  if (examSettings?.shuffle_options) {
    questions = questions.map((q) => (q.options ? { ...q, options: seededShuffle(q.options, sessionId + q.id) } : q));
  }

  const examData: ExamData = {
    id: exam.id,
    title: exam.title,
    subjectName: (exam as any).subjects?.name ?? "",
    durationMinutes: exam.duration_minutes,
    questions,
  };

  // ---- Restore any answers already saved for this session ----
  const { data: savedAnswers } = await admin.from("student_answers").select("question_id, selected_option_id, free_text_answer, is_flagged").eq("session_id", sessionId).eq("school_id", ctx.schoolId);
  const existingAnswers: AnswersMap = {};
  for (const a of savedAnswers ?? []) {
    existingAnswers[a.question_id] = { value: a.selected_option_id ?? a.free_text_answer ?? "", flagged: a.is_flagged };
  }

  return NextResponse.json({ sessionId, exam: examData, existingAnswers });
}
