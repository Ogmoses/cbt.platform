"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import QuestionBankManager from "@/components/teacher/QuestionBankManager";
import { createClient } from "@/lib/supabase/client";
import { orThrow } from "@/lib/supabaseErrors";
import { useAuthUser, signOutAndRedirect } from "@/lib/useAuthUser";
import type { BankQuestion, ClassOption, SubjectOption, ImportBatch } from "@/components/teacher/types";
import PageLoading from "@/components/layout/PageLoading";

export default function TeacherQuestionsPage() {
  const router = useRouter();
  const authUser = useAuthUser();
  const supabase = createClient();

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    if (!authUser) return;

    const [{ data: assignmentRows }, { data: questionRows }] = await Promise.all([
      supabase.from("teacher_subjects").select("subjects(id, name), classes(id, name)").eq("teacher_id", authUser.id),
      supabase
        .from("questions")
        .select(
          "id, subject_id, class_id, topic, type, prompt, image_url, points, reference_answer, updated_at, import_group_id, import_group_label, subjects(name), classes(name), question_options(id, option_text, is_correct, order_index)"
        )
        .eq("created_by", authUser.id)
        .order("updated_at", { ascending: false }),
    ]);

    const uniqueSubjects = new Map<string, string>();
    const uniqueClasses = new Map<string, string>();
    for (const row of assignmentRows ?? []) {
      const s = (row as any).subjects;
      const c = (row as any).classes;
      if (s) uniqueSubjects.set(s.id, s.name);
      if (c) uniqueClasses.set(c.id, c.name);
    }

    if (uniqueSubjects.size === 0 || uniqueClasses.size === 0) {
      // No teacher_subjects assignments yet (e.g. an admin hasn't set them
      // up) — fall back to everything rather than leaving the teacher
      // completely unable to create a question.
      const [{ data: allSubjects }, { data: allClasses }] = await Promise.all([
        supabase.from("subjects").select("id, name").order("name"),
        supabase.from("classes").select("id, name").order("name"),
      ]);
      for (const s of allSubjects ?? []) uniqueSubjects.set(s.id, s.name);
      for (const c of allClasses ?? []) uniqueClasses.set(c.id, c.name);
    }

    setSubjects([...uniqueSubjects.entries()].map(([id, name]) => ({ id, name })));
    setClasses([...uniqueClasses.entries()].map(([id, name]) => ({ id, name })));
    setQuestions(
      (questionRows ?? []).map((q: any) => ({
        id: q.id,
        subjectId: q.subject_id,
        subjectName: q.subjects?.name ?? "",
        classId: q.class_id,
        className: q.classes?.name ?? "",
        topic: q.topic ?? "",
        type: q.type,
        prompt: q.prompt,
        imageUrl: q.image_url,
        points: q.points,
        options: (q.question_options ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((o: any) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct })),
        referenceAnswer: q.reference_answer,
        updatedAt: q.updated_at,
        importGroupId: q.import_group_id,
        importGroupLabel: q.import_group_label,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  /**
   * Updates a question's options to match the editor's final state,
   * without ever deleting-then-reinserting the whole set.
   *
   * The old version did exactly that on every single save — delete all
   * existing options, insert the new ones fresh — regardless of whether
   * options had changed at all. That's what broke: `question_options.id`
   * is what `student_answers.selected_option_id` points to, so the moment
   * any option had ever been answered by a student, deleting it hit a
   * foreign key constraint and failed the entire save — even when the
   * teacher only wanted to change the question's class, nothing to do
   * with options.
   *
   * This instead updates existing options in place (same id, so any
   * student_answers referencing them stay valid), only inserts options
   * that are genuinely new, and only deletes options that were actually
   * removed — and if one of those removals is itself blocked by the same
   * constraint (a student already answered with it), it's left in place
   * rather than failing the save, with a note returned so the caller can
   * tell the teacher what happened.
   */
  const syncOptions = async (
    questionId: string,
    options: BankQuestion["options"],
    previousOptions: BankQuestion["options"] | undefined
  ): Promise<string | null> => {
    const previousIds = new Set((previousOptions ?? []).map((o) => o.id));
    const nextOptions = options ?? [];
    const nextIds = new Set(nextOptions.map((o) => o.id));

    const toUpdate = nextOptions.filter((o) => previousIds.has(o.id));
    const toInsert = nextOptions.filter((o) => !previousIds.has(o.id));
    const toDelete = (previousOptions ?? []).filter((o) => !nextIds.has(o.id));

    await Promise.all(
      toUpdate.map((o) =>
        orThrow(
          supabase
            .from("question_options")
            .update({ option_text: o.text, is_correct: o.isCorrect, order_index: nextOptions.indexOf(o) })
            .eq("id", o.id)
        )
      )
    );

    if (toInsert.length > 0) {
      await orThrow(
        supabase.from("question_options").insert(
          toInsert.map((o) => ({
            question_id: questionId,
            option_text: o.text,
            is_correct: o.isCorrect,
            order_index: nextOptions.indexOf(o),
          }))
        )
      );
    }

    let keptCount = 0;
    for (const o of toDelete) {
      const { error } = await supabase.from("question_options").delete().eq("id", o.id);
      if (error) {
        if (error.code === "23503") {
          // Foreign key violation — a student's answer points at this
          // option. Keeping it (rather than failing the save) means the
          // teacher's other edits still go through; it just means this
          // one option can't be fully retired while that history exists.
          keptCount += 1;
        } else {
          throw new Error(error.message);
        }
      }
    }

    if (keptCount === 0) return null;
    return `Kept ${keptCount} option${keptCount === 1 ? "" : "s"} that couldn't be removed because a student has already answered with ${
      keptCount === 1 ? "it" : "them"
    }.`;
  };

  const handleCreate = async (
    q: Omit<BankQuestion, "id" | "updatedAt" | "subjectName" | "className">,
    opts?: { skipReload?: boolean }
  ) => {
    if (!authUser) return;
    const { data: created, error } = await supabase
      .from("questions")
      .insert({
        subject_id: q.subjectId,
        class_id: q.classId,
        topic: q.topic || null,
        created_by: authUser.id,
        type: q.type,
        prompt: q.prompt,
        image_url: q.imageUrl ?? null, // TODO: upload to Supabase Storage instead of a data: URL
        points: q.points,
        reference_answer: q.referenceAnswer ?? null,
        import_group_id: q.importGroupId ?? null,
        import_group_label: q.importGroupLabel ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Couldn't save the question.");
    if (q.options) await syncOptions(created.id, q.options, []);
    // Bulk import saves many questions in a tight loop — reloading the
    // full list after every single one would mean dozens of redundant
    // round-trips for one import. The caller does one loadAll() itself
    // once the whole batch is done instead.
    if (!opts?.skipReload) await loadAll();
  };

  const handleUpdate = async (id: string, q: Omit<BankQuestion, "id" | "updatedAt" | "subjectName" | "className">) => {
    const { error } = await supabase
      .from("questions")
      .update({
        subject_id: q.subjectId,
        class_id: q.classId,
        topic: q.topic || null,
        type: q.type,
        prompt: q.prompt,
        image_url: q.imageUrl ?? null,
        points: q.points,
        reference_answer: q.referenceAnswer ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    const previous = questions.find((qq) => qq.id === id);
    const warning = await syncOptions(id, q.options, previous?.options);
    await loadAll();
    return warning ? { warning } : undefined;
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await loadAll();
  };

  // --- In-progress bulk-import reviews ("Reviewing" section) ---------
  // See components/teacher/QuestionImportModal.tsx for where these are
  // written (closing the review screen before finishing saves one) and
  // read back (resuming one reopens the modal with its saved state).

  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);

  const loadImportBatches = async () => {
    if (!authUser) return;
    const { data } = await supabase
      .from("question_import_batches")
      .select("id, subject_id, class_id, source_filename, draft_questions, updated_at")
      .eq("created_by", authUser.id)
      .order("updated_at", { ascending: false });
    setImportBatches(
      (data ?? []).map((b) => ({
        id: b.id,
        subjectId: b.subject_id,
        classId: b.class_id,
        sourceFilename: b.source_filename,
        draftQuestions: b.draft_questions,
        updatedAt: b.updated_at,
      }))
    );
  };

  useEffect(() => {
    loadImportBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  const handleSaveImportBatch = async (batch: {
    id?: string;
    subjectId: string;
    classId: string | null;
    sourceFilename: string | null;
    draftQuestions: unknown;
  }) => {
    if (!authUser) return;
    if (batch.id) {
      await orThrow(
        supabase
          .from("question_import_batches")
          .update({ draft_questions: batch.draftQuestions, updated_at: new Date().toISOString() })
          .eq("id", batch.id)
      );
    } else {
      await orThrow(
        supabase.from("question_import_batches").insert({
          created_by: authUser.id,
          subject_id: batch.subjectId,
          class_id: batch.classId,
          source_filename: batch.sourceFilename,
          draft_questions: batch.draftQuestions,
        })
      );
    }
    await loadImportBatches();
  };

  const handleDeleteImportBatch = async (id: string) => {
    await orThrow(supabase.from("question_import_batches").delete().eq("id", id));
    await loadImportBatches();
  };

  return (
    <DashboardLayout role="teacher" pageTitle="Question Bank" userName={authUser?.fullName ?? ""} onLogout={() => signOutAndRedirect(router)}>
      {loading ? <PageLoading /> : (
        <QuestionBankManager
          subjects={subjects}
          classes={classes}
          questions={questions}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          importBatches={importBatches}
          onSaveImportBatch={handleSaveImportBatch}
          onDeleteImportBatch={handleDeleteImportBatch}
        />
      )}
    </DashboardLayout>
  );
}
