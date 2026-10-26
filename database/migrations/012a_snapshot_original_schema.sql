-- 012a — Records your CURRENT (pre-multi-tenant) security rules and constraints
-- into a backup table, generated from the live database catalog, so
-- 012_rollback.sql can restore them exactly. Run this BEFORE 012.
create table mt_backup_ddl (
  seq    serial primary key,
  kind   text not null,   -- 'policy' | 'fk' | 'unique'
  target text,
  ddl    text not null
);

insert into mt_backup_ddl (kind, target, ddl)
select 'unique', conrelid::regclass::text || '.' || conname,
       format('alter table %s add constraint %I %s', conrelid::regclass, conname, pg_get_constraintdef(oid))
from pg_constraint
where connamespace = 'public'::regnamespace and contype = 'u'
  and conname in ('users_admission_number_key', 'users_staff_id_key', 'subjects_code_key');

insert into mt_backup_ddl (kind, target, ddl)
select 'fk', conrelid::regclass::text || '.' || conname,
       format('alter table %s add constraint %I %s', conrelid::regclass, conname, pg_get_constraintdef(oid))
from pg_constraint
where connamespace = 'public'::regnamespace and contype = 'f'
  and conname in ('access_tokens_user_id_fkey', 'batch_students_batch_id_fkey', 'batch_students_student_id_fkey', 'class_subjects_class_id_fkey', 'class_subjects_subject_id_fkey', 'exam_batches_exam_id_fkey', 'exam_questions_exam_id_fkey', 'exam_questions_question_id_fkey', 'exams_class_id_fkey', 'exams_created_by_fkey', 'exams_subject_id_fkey', 'exams_term_id_fkey', 'question_import_batches_class_id_fkey', 'question_import_batches_created_by_fkey', 'question_import_batches_subject_id_fkey', 'question_options_question_id_fkey', 'questions_class_id_fkey', 'questions_created_by_fkey', 'questions_subject_id_fkey', 'results_exam_id_fkey', 'results_session_id_fkey', 'results_student_id_fkey', 'student_answers_graded_by_fkey', 'student_answers_question_id_fkey', 'student_answers_selected_option_id_fkey', 'student_answers_session_id_fkey', 'student_exam_sessions_batch_id_fkey', 'student_exam_sessions_exam_id_fkey', 'student_exam_sessions_student_id_fkey', 'teacher_subjects_class_id_fkey', 'teacher_subjects_subject_id_fkey', 'teacher_subjects_teacher_id_fkey', 'term_subject_results_student_id_fkey', 'term_subject_results_subject_id_fkey', 'term_subject_results_term_id_fkey', 'terms_academic_session_id_fkey', 'users_class_id_fkey')
order by conrelid::regclass::text, conname;

insert into mt_backup_ddl (kind, target, ddl)
select 'policy', schemaname || '.' || tablename || '.' || policyname,
       format('create policy %I on %I.%I as %s for %s to %s%s%s',
              policyname, schemaname, tablename, lower(permissive), cmd, array_to_string(roles, ', '),
              case when qual is not null then ' using (' || qual || ')' else '' end,
              case when with_check is not null then ' with check (' || with_check || ')' else '' end)
from pg_policies
where (schemaname = 'public' and tablename <> 'school_profile')
   or (schemaname = 'storage' and tablename = 'objects' and policyname in ('question_images_insert', 'question_images_update', 'question_images_delete', 'school_assets_admin_insert', 'school_assets_admin_update', 'school_assets_admin_delete'))
order by schemaname, tablename, policyname;
