-- 009 — A teacher can only put their OWN questions into their OWN exams.
--
-- exam_questions_manage previously only checked exam ownership, so a
-- question id belonging to another teacher could be attached to an exam
-- through the API. (The Question Bank and Exam Builder screens already
-- filter by created_by, and the live `questions` / `question_options` /
-- `question_import_batches` policies were verified correct, so nothing
-- else needed changing.) Existing rows are untouched; this only governs
-- new writes.
drop policy if exists exam_questions_manage on exam_questions;
create policy exam_questions_manage on exam_questions
  for all
  using (
    current_role_is('super_admin')
    or exists (select 1 from exams where exams.id = exam_questions.exam_id and exams.created_by = auth.uid())
  )
  with check (
    current_role_is('super_admin')
    or (
      exists (select 1 from exams where exams.id = exam_questions.exam_id and exams.created_by = auth.uid())
      and exists (select 1 from questions q where q.id = exam_questions.question_id and q.created_by = auth.uid())
    )
  );
