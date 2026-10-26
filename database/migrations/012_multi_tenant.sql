-- 012 — Multi-tenant: many independent schools on one deployment.
--
-- WHAT THIS DOES (all in one transaction — it fully applies or not at all):
--   1. `schools` table (+ status: pending / active / suspended)
--   2. school_id on EVERY tenant table, backfilled with your current school
--      ("Soaring Fountain Group of Schools", code `soaring-fountain`)
--   3. Per-school uniqueness for student IDs, staff IDs and subject codes
--   4. Composite foreign keys, so a row can never point at another school's
--      row — enforced by the database even for server/service-role writes
--   5. Every old RLS policy replaced by tenant-scoped ones
--   6. Storage policies scoped per school
--   7. Public branding lookup + platform-owner analytics functions
--
-- NOT touched here: the old `school_profile` table stays (so the live app
-- keeps working until the new code is deployed); 013 drops it afterwards.
--
-- DRY-RUN TESTED: applied together with database/tests/multi_tenant_isolation_test.sql
-- inside a transaction that was rolled back, against the real database
-- structure — 33 of 33 isolation checks passed. (The dry run caught and fixed
-- one ordering bug: helper functions must be created after school_id exists.)
-- ORDER: 011, then 012a (backs up your current rules so this can be undone), then 012, then 014.
-- To undo everything: 012_rollback.sql (dry-run verified: structure and data come back identical).

-- ============================================================ 1. schools
create type school_status as enum ('pending', 'active', 'suspended');

create table schools (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  code            text not null unique
                    check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) between 3 and 40),
  status          school_status not null default 'pending',
  logo_url        text,
  theme_color     text not null default '#AB1509' check (theme_color ~* '^#[0-9a-f]{6}$'),
  secondary_color text not null default '#fff7d3' check (secondary_color ~* '^#[0-9a-f]{6}$'),
  motto           text,
  address         text,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz
);
alter table schools enable row level security;

-- Your existing school becomes school #1, carrying over its current profile.
insert into schools (name, code, status, logo_url, theme_color, motto, address, approved_at)
select
  school_name,
  'soaring-fountain',
  'active',
  logo_url,
  case when theme_color ~* '^#[0-9a-f]{6}$' then theme_color else '#AB1509' end,
  motto,
  address,
  now()
from school_profile
where id = true;

do $$
begin
  if (select count(*) from schools) <> 1 then
    raise exception 'Expected exactly one school to be created from school_profile';
  end if;
end $$;

-- The code is baked into student login emails, so it can only be corrected
-- while a school is still pending (before anyone has accounts).
create or replace function schools_guard() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id then
    raise exception 'schools.id cannot change';
  end if;
  if new.code is distinct from old.code and old.status <> 'pending' then
    raise exception 'A school code cannot change once the school is approved';
  end if;
  return new;
end $$;
create trigger schools_guard before update on schools
  for each row execute function schools_guard();

-- ============================================== 3. school_id on every table
do $$
declare
  t   text;
  sid uuid := (select id from schools where code = 'soaring-fountain');
begin
  foreach t in array array['users', 'academic_sessions', 'terms', 'classes', 'subjects', 'class_subjects', 'grading_scale', 'lab_rooms', 'batch_templates', 'teacher_subjects', 'questions', 'question_options', 'question_import_batches', 'exams', 'exam_questions', 'exam_batches', 'batch_students', 'student_exam_sessions', 'student_answers', 'results', 'term_subject_results', 'access_tokens'] loop
    execute format('alter table %I add column school_id uuid', t);
    execute format('update %I set school_id = %L', t, sid);
    if t <> 'users' then
      execute format('alter table %I alter column school_id set not null', t);
    end if;
    execute format('alter table %I add constraint %I foreign key (school_id) references schools(id) on delete restrict', t, t || '_school_id_fkey');
    execute format('create index %I on %I (school_id)', 'idx_' || t || '_school_id', t);
  end loop;
end $$;

-- Only the platform owner has no school; everyone else must have one.
alter table users add constraint users_school_role_chk
  check ((role = 'platform_owner') = (school_id is null));

-- ============================================================ 3b. helpers
-- (Created AFTER school_id exists: SQL-language functions are checked when they are created.)
-- SECURITY DEFINER so they can read `users` without triggering RLS recursion
-- (same pattern as current_role_is).

-- The caller's school, whatever its status. NULL for the platform owner.
create or replace function get_user_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from users where id = auth.uid();
$$;

-- The caller's school ONLY IF that school is active. Every tenant policy uses
-- this, so pending/suspended schools are locked out at the database level,
-- not just in the UI.
create or replace function active_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select u.school_id
  from users u join schools s on s.id = u.school_id
  where u.id = auth.uid() and s.status = 'active';
$$;

revoke execute on function get_user_school_id() from public, anon;
revoke execute on function active_school_id() from public, anon;
grant execute on function get_user_school_id() to authenticated, service_role;
grant execute on function active_school_id() to authenticated, service_role;

-- ======================================== 4. uniqueness: per school, not global
alter table users drop constraint users_admission_number_key;
alter table users drop constraint users_staff_id_key;
alter table users add constraint users_school_admission_key unique (school_id, admission_number);
alter table users add constraint users_school_staff_key     unique (school_id, staff_id);
-- users.email deliberately stays globally unique: one email = one school.

alter table subjects drop constraint subjects_code_key;
alter table subjects add constraint subjects_school_code_key unique (school_id, code);

-- ============================== 5. composite FKs: no cross-school references
-- Each referenced table needs a (school_id, id) key for the composite FKs below.
do $$
declare t text;
begin
  foreach t in array array['users', 'academic_sessions', 'terms', 'classes', 'subjects', 'questions', 'question_options', 'exams', 'exam_batches', 'student_exam_sessions'] loop
    execute format('alter table %I add constraint %I unique (school_id, id)', t, t || '_school_id_id_key');
  end loop;
end $$;

-- Each FK is replaced under its ORIGINAL name (so any PostgREST embed hints
-- like `questions!questions_subject_id_fkey` keep working) and now also
-- requires the child and parent to share a school_id.

alter table access_tokens drop constraint access_tokens_user_id_fkey;
alter table access_tokens add constraint access_tokens_user_id_fkey foreign key (school_id, user_id) references users (school_id, id) on delete cascade;
alter table batch_students drop constraint batch_students_batch_id_fkey;
alter table batch_students add constraint batch_students_batch_id_fkey foreign key (school_id, batch_id) references exam_batches (school_id, id) on delete cascade;
alter table batch_students drop constraint batch_students_student_id_fkey;
alter table batch_students add constraint batch_students_student_id_fkey foreign key (school_id, student_id) references users (school_id, id) on delete cascade;
alter table class_subjects drop constraint class_subjects_class_id_fkey;
alter table class_subjects add constraint class_subjects_class_id_fkey foreign key (school_id, class_id) references classes (school_id, id) on delete cascade;
alter table class_subjects drop constraint class_subjects_subject_id_fkey;
alter table class_subjects add constraint class_subjects_subject_id_fkey foreign key (school_id, subject_id) references subjects (school_id, id) on delete cascade;
alter table exam_batches drop constraint exam_batches_exam_id_fkey;
alter table exam_batches add constraint exam_batches_exam_id_fkey foreign key (school_id, exam_id) references exams (school_id, id) on delete cascade;
alter table exam_questions drop constraint exam_questions_exam_id_fkey;
alter table exam_questions add constraint exam_questions_exam_id_fkey foreign key (school_id, exam_id) references exams (school_id, id) on delete cascade;
alter table exam_questions drop constraint exam_questions_question_id_fkey;
alter table exam_questions add constraint exam_questions_question_id_fkey foreign key (school_id, question_id) references questions (school_id, id) on delete cascade;
alter table exams drop constraint exams_class_id_fkey;
alter table exams add constraint exams_class_id_fkey foreign key (school_id, class_id) references classes (school_id, id);
alter table exams drop constraint exams_created_by_fkey;
alter table exams add constraint exams_created_by_fkey foreign key (school_id, created_by) references users (school_id, id);
alter table exams drop constraint exams_subject_id_fkey;
alter table exams add constraint exams_subject_id_fkey foreign key (school_id, subject_id) references subjects (school_id, id);
alter table exams drop constraint exams_term_id_fkey;
alter table exams add constraint exams_term_id_fkey foreign key (school_id, term_id) references terms (school_id, id);
alter table question_import_batches drop constraint question_import_batches_class_id_fkey;
alter table question_import_batches add constraint question_import_batches_class_id_fkey foreign key (school_id, class_id) references classes (school_id, id) on delete set null (class_id);
alter table question_import_batches drop constraint question_import_batches_created_by_fkey;
alter table question_import_batches add constraint question_import_batches_created_by_fkey foreign key (school_id, created_by) references users (school_id, id) on delete cascade;
alter table question_import_batches drop constraint question_import_batches_subject_id_fkey;
alter table question_import_batches add constraint question_import_batches_subject_id_fkey foreign key (school_id, subject_id) references subjects (school_id, id) on delete cascade;
alter table question_options drop constraint question_options_question_id_fkey;
alter table question_options add constraint question_options_question_id_fkey foreign key (school_id, question_id) references questions (school_id, id) on delete cascade;
alter table questions drop constraint questions_class_id_fkey;
alter table questions add constraint questions_class_id_fkey foreign key (school_id, class_id) references classes (school_id, id);
alter table questions drop constraint questions_created_by_fkey;
alter table questions add constraint questions_created_by_fkey foreign key (school_id, created_by) references users (school_id, id);
alter table questions drop constraint questions_subject_id_fkey;
alter table questions add constraint questions_subject_id_fkey foreign key (school_id, subject_id) references subjects (school_id, id) on delete cascade;
alter table results drop constraint results_exam_id_fkey;
alter table results add constraint results_exam_id_fkey foreign key (school_id, exam_id) references exams (school_id, id) on delete cascade;
alter table results drop constraint results_session_id_fkey;
alter table results add constraint results_session_id_fkey foreign key (school_id, session_id) references student_exam_sessions (school_id, id);
alter table results drop constraint results_student_id_fkey;
alter table results add constraint results_student_id_fkey foreign key (school_id, student_id) references users (school_id, id) on delete cascade;
alter table student_answers drop constraint student_answers_graded_by_fkey;
alter table student_answers add constraint student_answers_graded_by_fkey foreign key (school_id, graded_by) references users (school_id, id);
alter table student_answers drop constraint student_answers_question_id_fkey;
alter table student_answers add constraint student_answers_question_id_fkey foreign key (school_id, question_id) references questions (school_id, id) on delete cascade;
alter table student_answers drop constraint student_answers_selected_option_id_fkey;
alter table student_answers add constraint student_answers_selected_option_id_fkey foreign key (school_id, selected_option_id) references question_options (school_id, id);
alter table student_answers drop constraint student_answers_session_id_fkey;
alter table student_answers add constraint student_answers_session_id_fkey foreign key (school_id, session_id) references student_exam_sessions (school_id, id) on delete cascade;
alter table student_exam_sessions drop constraint student_exam_sessions_batch_id_fkey;
alter table student_exam_sessions add constraint student_exam_sessions_batch_id_fkey foreign key (school_id, batch_id) references exam_batches (school_id, id) on delete cascade;
alter table student_exam_sessions drop constraint student_exam_sessions_exam_id_fkey;
alter table student_exam_sessions add constraint student_exam_sessions_exam_id_fkey foreign key (school_id, exam_id) references exams (school_id, id) on delete cascade;
alter table student_exam_sessions drop constraint student_exam_sessions_student_id_fkey;
alter table student_exam_sessions add constraint student_exam_sessions_student_id_fkey foreign key (school_id, student_id) references users (school_id, id) on delete cascade;
alter table teacher_subjects drop constraint teacher_subjects_class_id_fkey;
alter table teacher_subjects add constraint teacher_subjects_class_id_fkey foreign key (school_id, class_id) references classes (school_id, id) on delete cascade;
alter table teacher_subjects drop constraint teacher_subjects_subject_id_fkey;
alter table teacher_subjects add constraint teacher_subjects_subject_id_fkey foreign key (school_id, subject_id) references subjects (school_id, id) on delete cascade;
alter table teacher_subjects drop constraint teacher_subjects_teacher_id_fkey;
alter table teacher_subjects add constraint teacher_subjects_teacher_id_fkey foreign key (school_id, teacher_id) references users (school_id, id) on delete cascade;
alter table term_subject_results drop constraint term_subject_results_student_id_fkey;
alter table term_subject_results add constraint term_subject_results_student_id_fkey foreign key (school_id, student_id) references users (school_id, id) on delete cascade;
alter table term_subject_results drop constraint term_subject_results_subject_id_fkey;
alter table term_subject_results add constraint term_subject_results_subject_id_fkey foreign key (school_id, subject_id) references subjects (school_id, id) on delete cascade;
alter table term_subject_results drop constraint term_subject_results_term_id_fkey;
alter table term_subject_results add constraint term_subject_results_term_id_fkey foreign key (school_id, term_id) references terms (school_id, id) on delete cascade;
alter table terms drop constraint terms_academic_session_id_fkey;
alter table terms add constraint terms_academic_session_id_fkey foreign key (school_id, academic_session_id) references academic_sessions (school_id, id) on delete cascade;
alter table users drop constraint users_class_id_fkey;
alter table users add constraint users_class_id_fkey foreign key (school_id, class_id) references classes (school_id, id);

-- ================================================== 6. triggers on tenant tables
-- Auto-fill school_id from the signed-in user, so existing browser inserts
-- (which don't send school_id) keep working. Server code using the service
-- role has no signed-in user and MUST send school_id explicitly; if it
-- doesn't, the insert fails loudly instead of landing in the wrong school.
create or replace function set_school_id_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.school_id is null then
    new.school_id := get_user_school_id();
  end if;
  if new.school_id is null then
    raise exception 'school_id is required (could not infer it) on %', tg_table_name
      using errcode = '23502';
  end if;
  return new;
end $$;

create or replace function prevent_school_id_change() returns trigger
language plpgsql as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed on %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['academic_sessions', 'terms', 'classes', 'subjects', 'class_subjects', 'grading_scale', 'lab_rooms', 'batch_templates', 'teacher_subjects', 'questions', 'question_options', 'question_import_batches', 'exams', 'exam_questions', 'exam_batches', 'batch_students', 'student_exam_sessions', 'student_answers', 'results', 'term_subject_results', 'access_tokens'] loop
    execute format('create trigger set_school_id before insert on %I for each row execute function set_school_id_default()', t);
  end loop;
  foreach t in array array['users', 'academic_sessions', 'terms', 'classes', 'subjects', 'class_subjects', 'grading_scale', 'lab_rooms', 'batch_templates', 'teacher_subjects', 'questions', 'question_options', 'question_import_batches', 'exams', 'exam_questions', 'exam_batches', 'batch_students', 'student_exam_sessions', 'student_answers', 'results', 'term_subject_results', 'access_tokens'] loop
    execute format('create trigger lock_school_id before update on %I for each row execute function prevent_school_id_change()', t);
  end loop;
end $$;

-- ============================================================ 7. RLS policies
-- Drop EVERY existing policy on the app tables (not school_profile, which is
-- left alone until 013) so nothing old and unscoped can survive.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename <> 'school_profile'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table access_tokens enable row level security;  -- no policies = service role only

-- "T" below means: the row belongs to the caller's school AND that school is
-- active:   school_id = (select active_school_id())
-- All policies are `to authenticated`; anonymous visitors get nothing.

-- ---- Reference data: any member of the school reads, school admin writes
do $$
declare t text;
begin
  foreach t in array array['academic_sessions','terms','classes','subjects','class_subjects','grading_scale','teacher_subjects'] loop
    execute format($f$create policy %I on %I for select to authenticated
      using (school_id = (select active_school_id()))$f$, t || '_tenant_read', t);
    execute format($f$create policy %I on %I for all to authenticated
      using (school_id = (select active_school_id()) and current_role_is('super_admin'))
      with check (school_id = (select active_school_id()) and current_role_is('super_admin'))$f$, t || '_admin_write', t);
  end loop;

  -- Staff-only reference data
  foreach t in array array['lab_rooms','batch_templates'] loop
    execute format($f$create policy %I on %I for select to authenticated
      using (school_id = (select active_school_id()) and (current_role_is('super_admin') or current_role_is('teacher')))$f$, t || '_staff_read', t);
    execute format($f$create policy %I on %I for all to authenticated
      using (school_id = (select active_school_id()) and current_role_is('super_admin'))
      with check (school_id = (select active_school_id()) and current_role_is('super_admin'))$f$, t || '_admin_write', t);
  end loop;
end $$;

-- ---- users
create policy users_read_own on users for select to authenticated
  using (id = auth.uid());

-- A school admin manages users of their own school only, and can never
-- create or promote anyone to platform_owner.
create policy users_admin_manage on users for all to authenticated
  using (school_id = (select active_school_id()) and current_role_is('super_admin') and role <> 'platform_owner')
  with check (school_id = (select active_school_id()) and current_role_is('super_admin') and role <> 'platform_owner');

create policy users_teacher_read_students on users for select to authenticated
  using (
    school_id = (select active_school_id())
    and role = 'student'
    and current_role_is('teacher')
    and (
      exists (select 1 from teacher_subjects ts where ts.teacher_id = auth.uid() and ts.class_id = users.class_id)
      or not exists (select 1 from teacher_subjects ts where ts.teacher_id = auth.uid())
    )
  );

-- ---- question bank (teacher's own questions; school admin sees the school's)
create policy questions_owner_manage on questions for all to authenticated
  using (school_id = (select active_school_id()) and (created_by = auth.uid() or current_role_is('super_admin')))
  with check (school_id = (select active_school_id()) and (created_by = auth.uid() or current_role_is('super_admin')));

create policy question_options_manage on question_options for all to authenticated
  using (
    school_id = (select active_school_id())
    and (current_role_is('super_admin')
         or exists (select 1 from questions q where q.id = question_options.question_id and q.created_by = auth.uid()))
  )
  with check (
    school_id = (select active_school_id())
    and (current_role_is('super_admin')
         or exists (select 1 from questions q where q.id = question_options.question_id and q.created_by = auth.uid()))
  );

create policy import_batches_owner_manage on question_import_batches for all to authenticated
  using (school_id = (select active_school_id()) and (created_by = auth.uid() or current_role_is('super_admin')))
  with check (school_id = (select active_school_id()) and (created_by = auth.uid() or current_role_is('super_admin')));

-- ---- exams
create policy exams_manage on exams for all to authenticated
  using (school_id = (select active_school_id()) and (current_role_is('super_admin') or created_by = auth.uid()))
  with check (school_id = (select active_school_id()) and (current_role_is('super_admin') or created_by = auth.uid()));

create policy exams_student_read on exams for select to authenticated
  using (school_id = (select active_school_id()) and current_user_assigned_to_exam(id));

-- A teacher can only put their OWN questions into their OWN exams (009).
create policy exam_questions_manage on exam_questions for all to authenticated
  using (
    school_id = (select active_school_id())
    and (current_role_is('super_admin')
         or exists (select 1 from exams where exams.id = exam_questions.exam_id and exams.created_by = auth.uid()))
  )
  with check (
    school_id = (select active_school_id())
    and (current_role_is('super_admin')
         or (exists (select 1 from exams where exams.id = exam_questions.exam_id and exams.created_by = auth.uid())
             and exists (select 1 from questions q where q.id = exam_questions.question_id and q.created_by = auth.uid())))
  );

create policy exam_questions_student_read on exam_questions for select to authenticated
  using (
    school_id = (select active_school_id())
    and exists (select 1 from student_exam_sessions ses where ses.exam_id = exam_questions.exam_id and ses.student_id = auth.uid())
  );

create policy exam_batches_manage on exam_batches for all to authenticated
  using (school_id = (select active_school_id()) and (current_role_is('super_admin') or current_user_created_exam(exam_id)))
  with check (school_id = (select active_school_id()) and (current_role_is('super_admin') or current_user_created_exam(exam_id)));

create policy exam_batches_student_read on exam_batches for select to authenticated
  using (school_id = (select active_school_id()) and current_user_assigned_to_batch(id));

create policy batch_students_manage on batch_students for all to authenticated
  using (school_id = (select active_school_id()) and (current_role_is('super_admin') or current_user_owns_batch(batch_id)))
  with check (school_id = (select active_school_id()) and (current_role_is('super_admin') or current_user_owns_batch(batch_id)));

create policy batch_students_own_read on batch_students for select to authenticated
  using (school_id = (select active_school_id()) and student_id = auth.uid());

-- ---- exam sessions, answers, results
create policy sessions_student_read on student_exam_sessions for select to authenticated
  using (school_id = (select active_school_id()) and student_id = auth.uid());

create policy sessions_teacher_read on student_exam_sessions for select to authenticated
  using (school_id = (select active_school_id()) and current_role_is('teacher') and current_user_created_exam(exam_id));

create policy answers_student_own on student_answers for all to authenticated
  using (
    school_id = (select active_school_id())
    and session_id in (select id from student_exam_sessions where student_id = auth.uid())
  )
  with check (
    school_id = (select active_school_id())
    and session_id in (select id from student_exam_sessions where student_id = auth.uid())
  );

create policy answers_teacher_read on student_answers for select to authenticated
  using (
    school_id = (select active_school_id())
    and (current_role_is('super_admin')
         or exists (select 1 from student_exam_sessions ses join exams e on e.id = ses.exam_id
                    where ses.id = student_answers.session_id and e.created_by = auth.uid()))
  );

create policy results_admin_manage on results for all to authenticated
  using (school_id = (select active_school_id()) and current_role_is('super_admin'))
  with check (school_id = (select active_school_id()) and current_role_is('super_admin'));

create policy results_student_own on results for select to authenticated
  using (school_id = (select active_school_id()) and student_id = auth.uid() and published = true);

create policy results_teacher_read on results for select to authenticated
  using (school_id = (select active_school_id()) and current_role_is('teacher') and current_user_created_exam(exam_id));

create policy term_results_admin on term_subject_results for all to authenticated
  using (school_id = (select active_school_id()) and current_role_is('super_admin'))
  with check (school_id = (select active_school_id()) and current_role_is('super_admin'));

create policy term_results_student_read on term_subject_results for select to authenticated
  using (school_id = (select active_school_id()) and student_id = auth.uid() and published = true);

-- ---- schools
-- Branding for signed-out visitors goes through get_school_branding() below,
-- so there is no table-wide public read that would let anyone list your
-- customer schools.
create policy schools_read_own on schools for select to authenticated
  using (id = get_user_school_id());

create policy schools_owner_read_all on schools for select to authenticated
  using (current_role_is('platform_owner'));

create policy schools_admin_update_own on schools for update to authenticated
  using (id = get_user_school_id() and current_role_is('super_admin') and status = 'active')
  with check (id = get_user_school_id() and current_role_is('super_admin') and status = 'active');

-- A school admin may edit branding only — never status, code or approval.
-- (Status changes happen from the platform-owner console via the service role.)
revoke all on schools from anon, authenticated;
grant select on schools to authenticated;
grant update (name, logo_url, theme_color, secondary_color, motto, address) on schools to authenticated;

-- ===================================================== 8. storage (per school)
-- Paths now start with the school id:
--   question-images : <school_id>/<user_id>/<file>
--   school-assets   : <school_id>/<file>
-- (Both buckets are empty today, so nothing needs moving.)
drop policy if exists question_images_insert on storage.objects;
drop policy if exists question_images_update on storage.objects;
drop policy if exists question_images_delete on storage.objects;
drop policy if exists school_assets_admin_insert on storage.objects;
drop policy if exists school_assets_admin_update on storage.objects;
drop policy if exists school_assets_admin_delete on storage.objects;

create policy question_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and (current_role_is('teacher') or current_role_is('super_admin'))
    and (storage.foldername(name))[1] = (select active_school_id())::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy question_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = (select active_school_id())::text
    and ((storage.foldername(name))[2] = auth.uid()::text or current_role_is('super_admin'))
  );
create policy question_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = (select active_school_id())::text
    and ((storage.foldername(name))[2] = auth.uid()::text or current_role_is('super_admin'))
  );

create policy school_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-assets' and current_role_is('super_admin')
    and (storage.foldername(name))[1] = (select active_school_id())::text
  );
create policy school_assets_update on storage.objects for update to authenticated
  using (
    bucket_id = 'school-assets' and current_role_is('super_admin')
    and (storage.foldername(name))[1] = (select active_school_id())::text
  );
create policy school_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-assets' and current_role_is('super_admin')
    and (storage.foldername(name))[1] = (select active_school_id())::text
  );

-- ====================================== 9. public branding + owner analytics
-- Signed-out login pages need a school's name/logo/colours. This returns ONLY
-- that one school (looked up by its code), and only its status if it isn't
-- active — so nobody can list schools or peek at pending ones.
create or replace function get_school_branding(p_code text)
returns table (id uuid, code text, status school_status, name text, logo_url text,
               theme_color text, secondary_color text, motto text, address text)
language sql stable security definer set search_path = public as $$
  select s.id, s.code, s.status,
         case when s.status = 'active' then s.name end,
         case when s.status = 'active' then s.logo_url end,
         case when s.status = 'active' then s.theme_color end,
         case when s.status = 'active' then s.secondary_color end,
         case when s.status = 'active' then s.motto end,
         case when s.status = 'active' then s.address end
  from schools s
  where s.code = lower(trim(p_code));
$$;
grant execute on function get_school_branding(text) to anon, authenticated, service_role;

-- Per-school headline numbers for the platform-owner dashboard. Returns rows
-- only when the caller IS the platform owner; anyone else gets an empty
-- result. Counts only — never student names, answers or scores.
create or replace function platform_school_stats()
returns table (school_id uuid, name text, code text, status school_status, created_at timestamptz,
               students bigint, teachers bigint, exams bigint, exam_sessions bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.code, s.status, s.created_at,
         (select count(*) from users u where u.school_id = s.id and u.role = 'student'),
         (select count(*) from users u where u.school_id = s.id and u.role = 'teacher'),
         (select count(*) from exams e where e.school_id = s.id),
         (select count(*) from student_exam_sessions x where x.school_id = s.id)
  from schools s
  where current_role_is('platform_owner')
  order by s.created_at;
$$;
revoke execute on function platform_school_stats() from public, anon;
grant execute on function platform_school_stats() to authenticated, service_role;

