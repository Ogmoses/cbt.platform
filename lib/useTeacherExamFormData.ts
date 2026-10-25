"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BankQuestion, ClassOption, StudentOption, SubjectOption, TermOption } from "@/components/teacher/types";

export function useTeacherExamFormData(authUserId: string | undefined) {
  const supabase = createClient();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [questionBank, setQuestionBank] = useState<BankQuestion[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, StudentOption[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUserId) return;
    (async () => {
      const [{ data: assignmentRows }, { data: termRows }, { data: questionRows }] = await Promise.all([
        supabase.from("teacher_subjects").select("subjects(id, name), classes(id, name)").eq("teacher_id", authUserId),
        supabase.from("terms").select("id, name").order("is_current", { ascending: false }),
        supabase
          .from("questions")
          .select("id, subject_id, class_id, topic, type, prompt, points, reference_answer, import_group_id, import_group_label, subjects(name)")
          .eq("created_by", authUserId),
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
        // No teacher_subjects assignments yet — fall back to everything
        // rather than leaving Exam Builder completely unusable.
        const [{ data: allSubjects }, { data: allClasses }] = await Promise.all([
          supabase.from("subjects").select("id, name").order("name"),
          supabase.from("classes").select("id, name").order("name"),
        ]);
        for (const s of allSubjects ?? []) uniqueSubjects.set(s.id, s.name);
        for (const c of allClasses ?? []) uniqueClasses.set(c.id, c.name);
      }

      setSubjects([...uniqueSubjects.entries()].map(([id, name]) => ({ id, name })));
      const classList = [...uniqueClasses.entries()].map(([id, name]) => ({ id, name }));
      setClasses(classList);
      setTerms(termRows ?? []);

      const { data: studentRows } = classList.length > 0
        ? await supabase
            .from("users")
            .select("id, full_name, admission_number, class_id")
            .eq("role", "student")
            .eq("is_active", true)
            .in("class_id", classList.map((c) => c.id))
        : { data: [] };
      const grouped: Record<string, StudentOption[]> = {};
      for (const s of studentRows ?? []) {
        const list = grouped[s.class_id] ?? (grouped[s.class_id] = []);
        list.push({ id: s.id, fullName: s.full_name, admissionNumber: s.admission_number });
      }
      setStudentsByClass(grouped);

      setQuestionBank(
        (questionRows ?? []).map((q: any) => ({
          id: q.id,
          subjectId: q.subject_id,
          subjectName: q.subjects?.name ?? "",
          classId: q.class_id,
          className: "",
          topic: q.topic ?? "",
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          referenceAnswer: q.reference_answer,
          importGroupId: q.import_group_id,
          importGroupLabel: q.import_group_label,
          updatedAt: new Date().toISOString(),
        }))
      );
      setLoading(false);
    })();
  }, [authUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { subjects, classes, terms, questionBank, studentsByClass, loading };
}
