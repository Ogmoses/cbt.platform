-- 012_rollback — Puts the database back exactly as it was before 012 + 014.
--
-- Needs the backup table made by 012a. Safe to run ONLY while one school
-- exists (a second school's data can't fit the old one-school rules — the
-- restored global-unique constraints would reject it) and BEFORE 013 drops
-- school_profile. Everything the app stored is kept; only the school_id
-- columns, the schools table and the new rules/functions are removed.
-- (The harmless `platform_owner` role label stays — Postgres can't remove enum values.)

-- 1. triggers
do $$
declare t text;
begin
  foreach t in array array['users', 'academic_sessions', 'terms', 'classes', 'subjects', 'class_subjects', 'grading_scale', 'lab_rooms', 'batch_templates', 'teacher_subjects', 'questions', 'question_options', 'question_import_batches', 'exams', 'exam_questions', 'exam_batches', 'batch_students', 'student_exam_sessions', 'student_answers', 'results', 'term_subject_results', 'access_tokens'] loop
    execute format('drop trigger if exists lock_school_id on %I', t);
    execute format('drop trigger if exists set_school_id on %I', t);
  end loop;
end $$;
drop trigger if exists seed_school_defaults on schools;

-- 2. all current policies (their expressions use school_id / the new functions)
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename <> 'school_profile' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
drop policy if exists question_images_delete on storage.objects;
drop policy if exists question_images_insert on storage.objects;
drop policy if exists question_images_update on storage.objects;
drop policy if exists school_assets_admin_delete on storage.objects;
drop policy if exists school_assets_admin_insert on storage.objects;
drop policy if exists school_assets_admin_update on storage.objects;
drop policy if exists school_assets_delete on storage.objects;
drop policy if exists school_assets_insert on storage.objects;
drop policy if exists school_assets_update on storage.objects;

-- 3. composite foreign keys, then the (school_id, id) keys they pointed at
alter table access_tokens drop constraint access_tokens_user_id_fkey;
alter table batch_students drop constraint batch_students_batch_id_fkey;
alter table batch_students drop constraint batch_students_student_id_fkey;
alter table class_subjects drop constraint class_subjects_class_id_fkey;
alter table class_subjects drop constraint class_subjects_subject_id_fkey;
alter table exam_batches drop constraint exam_batches_exam_id_fkey;
alter table exam_questions drop constraint exam_questions_exam_id_fkey;
alter table exam_questions drop constraint exam_questions_question_id_fkey;
alter table exams drop constraint exams_class_id_fkey;
alter table exams drop constraint exams_created_by_fkey;
alter table exams drop constraint exams_subject_id_fkey;
alter table exams drop constraint exams_term_id_fkey;
alter table question_import_batches drop constraint question_import_batches_class_id_fkey;
alter table question_import_batches drop constraint question_import_batches_created_by_fkey;
alter table question_import_batches drop constraint question_import_batches_subject_id_fkey;
alter table question_options drop constraint question_options_question_id_fkey;
alter table questions drop constraint questions_class_id_fkey;
alter table questions drop constraint questions_created_by_fkey;
alter table questions drop constraint questions_subject_id_fkey;
alter table results drop constraint results_exam_id_fkey;
alter table results drop constraint results_session_id_fkey;
alter table results drop constraint results_student_id_fkey;
alter table student_answers drop constraint student_answers_graded_by_fkey;
alter table student_answers drop constraint student_answers_question_id_fkey;
alter table student_answers drop constraint student_answers_selected_option_id_fkey;
alter table student_answers drop constraint student_answers_session_id_fkey;
alter table student_exam_sessions drop constraint student_exam_sessions_batch_id_fkey;
alter table student_exam_sessions drop constraint student_exam_sessions_exam_id_fkey;
alter table student_exam_sessions drop constraint student_exam_sessions_student_id_fkey;
alter table teacher_subjects drop constraint teacher_subjects_class_id_fkey;
alter table teacher_subjects drop constraint teacher_subjects_subject_id_fkey;
alter table teacher_subjects drop constraint teacher_subjects_teacher_id_fkey;
alter table term_subject_results drop constraint term_subject_results_student_id_fkey;
alter table term_subject_results drop constraint term_subject_results_subject_id_fkey;
alter table term_subject_results drop constraint term_subject_results_term_id_fkey;
alter table terms drop constraint terms_academic_session_id_fkey;
alter table users drop constraint users_class_id_fkey;
alter table users drop constraint users_school_id_id_key;
alter table academic_sessions drop constraint academic_sessions_school_id_id_key;
alter table terms drop constraint terms_school_id_id_key;
alter table classes drop constraint classes_school_id_id_key;
alter table subjects drop constraint subjects_school_id_id_key;
alter table questions drop constraint questions_school_id_id_key;
alter table question_options drop constraint question_options_school_id_id_key;
alter table exams drop constraint exams_school_id_id_key;
alter table exam_batches drop constraint exam_batches_school_id_id_key;
alter table student_exam_sessions drop constraint student_exam_sessions_school_id_id_key;

-- 4. per-school uniqueness and the role/school check
alter table users drop constraint users_school_role_chk;
alter table users drop constraint users_school_admission_key;
alter table users drop constraint users_school_staff_key;
alter table subjects drop constraint subjects_school_code_key;

-- 5. school_id columns (this also removes their own FKs and indexes), then schools itself
do $$
declare t text;
begin
  foreach t in array array['users', 'academic_sessions', 'terms', 'classes', 'subjects', 'class_subjects', 'grading_scale', 'lab_rooms', 'batch_templates', 'teacher_subjects', 'questions', 'question_options', 'question_import_batches', 'exams', 'exam_questions', 'exam_batches', 'batch_students', 'student_exam_sessions', 'student_answers', 'results', 'term_subject_results', 'access_tokens'] loop
    execute format('alter table %I drop column school_id', t);
  end loop;
end $$;
drop function if exists get_school_branding(text);
drop function if exists platform_school_stats();
drop table schools;
drop type school_status;
drop function if exists get_user_school_id();
drop function if exists active_school_id();
drop function if exists set_school_id_default();
drop function if exists prevent_school_id_change();
drop function if exists schools_guard();
drop function if exists seed_school_defaults();

-- 6. restore the original constraints and policies from the backup, in order
do $$
declare r record;
begin
  for r in select ddl from mt_backup_ddl where kind = 'unique' order by seq loop execute r.ddl; end loop;
  for r in select ddl from mt_backup_ddl where kind = 'fk'     order by seq loop execute r.ddl; end loop;
  for r in select ddl from mt_backup_ddl where kind = 'policy' order by seq loop execute r.ddl; end loop;
end $$;
