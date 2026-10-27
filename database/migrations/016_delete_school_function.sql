-- 016 — Permanently delete a whole school and everything in it.
--
-- One function, one transaction: either the entire school is gone or nothing
-- changed. It removes, children before parents: exam answers, results,
-- sittings, batches, exams, questions and options, import batches, classes,
-- subjects, terms, sessions, grading scale, rooms, time slots, access tokens,
-- then every user account of that school (including their sign-in accounts),
-- then the school itself.
--
-- Safety: only the service role can call it (the platform-owner API route
-- does, after checking the caller is the owner), and the caller must pass the
-- school's own code as confirmation or it refuses. It can't be run on
-- "platform" data: only rows carrying this school's id are touched.
--
-- It cannot remove uploaded image FILES (storage) — the API route does that
-- afterwards.
create or replace function delete_school_permanently(p_school_id uuid, p_confirm_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code   text;
  v_users  uuid[];
  v_counts jsonb;
begin
  select code into v_code from schools where id = p_school_id;
  if v_code is null then
    raise exception 'School not found';
  end if;
  if v_code <> lower(trim(coalesce(p_confirm_code, ''))) then
    raise exception 'The confirmation code does not match this school';
  end if;

  select coalesce(array_agg(id), '{}') into v_users from users where school_id = p_school_id;

  v_counts := jsonb_build_object(
    'students',  (select count(*) from users where school_id = p_school_id and role = 'student'),
    'teachers',  (select count(*) from users where school_id = p_school_id and role = 'teacher'),
    'admins',    (select count(*) from users where school_id = p_school_id and role = 'super_admin'),
    'exams',     (select count(*) from exams where school_id = p_school_id),
    'questions', (select count(*) from questions where school_id = p_school_id),
    'sittings',  (select count(*) from student_exam_sessions where school_id = p_school_id),
    'results',   (select count(*) from results where school_id = p_school_id)
  );

  delete from student_answers        where school_id = p_school_id;
  delete from results                where school_id = p_school_id;
  delete from term_subject_results   where school_id = p_school_id;
  delete from student_exam_sessions  where school_id = p_school_id;
  delete from batch_students         where school_id = p_school_id;
  delete from exam_batches           where school_id = p_school_id;
  delete from exam_questions         where school_id = p_school_id;
  delete from exams                  where school_id = p_school_id;
  delete from question_options       where school_id = p_school_id;
  delete from questions              where school_id = p_school_id;
  delete from question_import_batches where school_id = p_school_id;
  delete from teacher_subjects       where school_id = p_school_id;
  delete from class_subjects         where school_id = p_school_id;
  update users set class_id = null   where school_id = p_school_id;
  delete from terms                  where school_id = p_school_id;
  delete from academic_sessions      where school_id = p_school_id;
  delete from classes                where school_id = p_school_id;
  delete from subjects               where school_id = p_school_id;
  delete from grading_scale          where school_id = p_school_id;
  delete from lab_rooms              where school_id = p_school_id;
  delete from batch_templates        where school_id = p_school_id;
  delete from access_tokens          where school_id = p_school_id;

  -- Sign-in accounts: deleting them also removes the matching users rows.
  delete from auth.users where id = any(v_users);

  delete from schools where id = p_school_id;

  return v_counts;
end $$;

revoke execute on function delete_school_permanently(uuid, text) from public, anon, authenticated;
grant execute on function delete_school_permanently(uuid, text) to service_role;
