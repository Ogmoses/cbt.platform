-- ============================================================================
-- Soaring Fountain Group of Schools — CBT & School Management Platform
-- Database Schema (PostgreSQL / Supabase)
-- ============================================================================
-- Run this in the Supabase SQL editor, or via `supabase db push` with this
-- file placed under supabase/migrations/. Designed for Supabase Auth, where
-- `auth.users.id` is the source of truth for login identity and `public.users`
-- stores app-level profile/role data keyed 1:1 to it.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CORE ENUMS
-- ----------------------------------------------------------------------------
create type user_role as enum ('super_admin', 'teacher', 'student');
create type question_type as enum ('multiple_choice', 'true_false', 'fill_blank', 'short_theory');
create type exam_status as enum ('draft', 'published', 'archived');
create type session_status as enum ('active', 'submitted', 'expired', 'terminated');

-- ----------------------------------------------------------------------------
-- 2. ACADEMIC STRUCTURE
-- ----------------------------------------------------------------------------
create table academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- e.g. '2025/2026'
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table terms (
  id uuid primary key default gen_random_uuid(),
  academic_session_id uuid not null references academic_sessions(id) on delete cascade,
  name text not null,                -- 'First Term', 'Second Term', 'Third Term'
  is_current boolean not null default false,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- 'JSS1', 'SS2 Science', etc.
  level text,                        -- 'Junior', 'Senior' — for grouping/reporting
  created_at timestamptz not null default now()
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,                  -- 'MTH101'
  created_at timestamptz not null default now()
);

-- which subjects are offered to which classes
create table class_subjects (
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  primary key (class_id, subject_id)
);

-- ----------------------------------------------------------------------------
-- 3. USERS (profile layer on top of Supabase Auth)
-- ----------------------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  email text unique,
  phone text,
  photo_url text,
  admission_number text unique,      -- students only
  staff_id text unique,              -- teachers/admins only
  class_id uuid references classes(id),          -- students: current class
  pin_hash text,                     -- optional secondary PIN for CBT kiosk login
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_users_role on users(role);
create index idx_users_class on users(class_id);

-- Helper: read the caller's role/id from their own users row. Defined here
-- (right after `users` exists) rather than down in §9, since §8's policies
-- need it too and SQL scripts run top to bottom.
--
-- SECURITY DEFINER is not optional here. Without it, this function's own
-- `select ... from users` is itself subject to users' RLS policies —
-- including the policy that calls this very function to grant admin
-- access — which re-invokes this function, which re-queries users, which
-- re-triggers the policy, forever, until Postgres hits its stack depth
-- limit. SECURITY DEFINER runs this one internal query with the function
-- owner's privileges, bypassing RLS for just that check and breaking the
-- cycle. (This shipped without it for a long stretch — every table whose
-- policies reference this function was silently broken for admin/teacher
-- reads and writes alike, masked because the app code wasn't checking the
-- `error` Supabase returned, just treating a failed call as empty data.)
-- search_path stays pinned since an unpinned one is a real privilege-
-- escalation risk on a SECURITY DEFINER function, not just a lint.
create or replace function current_role_is(target_role user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = target_role
  );
$$;

-- which subjects a teacher is assigned to teach, and to which classes
create table teacher_subjects (
  teacher_id uuid not null references users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  primary key (teacher_id, subject_id, class_id)
);

-- ----------------------------------------------------------------------------
-- 4. QUESTION BANK
-- ----------------------------------------------------------------------------
create table questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  topic text,
  created_by uuid not null references users(id),
  type question_type not null,
  prompt text not null,
  image_url text,                    -- diagram upload, from Supabase Storage
  points numeric(6,2) not null default 1,
  -- for fill_blank / short_theory, the reference answer used for auto-grading
  -- or as a marking guide for the teacher
  reference_answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_questions_subject on questions(subject_id);

-- options for multiple_choice / true_false questions
create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index idx_options_question on question_options(question_id);

-- ----------------------------------------------------------------------------
-- 5. EXAMS
-- ----------------------------------------------------------------------------
create table exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject_id uuid not null references subjects(id),
  class_id uuid not null references classes(id),
  term_id uuid not null references terms(id),
  created_by uuid not null references users(id),
  duration_minutes int not null,
  pass_mark numeric(6,2),
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  show_result_instantly boolean not null default false,
  status exam_status not null default 'draft',
  -- weighting toward the cumulative grade, e.g. 30 for "30% CA/CBT"
  weight_percent numeric(5,2) not null default 30,
  -- true for the single Terminal Exam in a term; false for CA/CBT-style
  -- contributors. The report-card rollup uses this to show separate
  -- "CA/CBT" and "Terminal" columns even though both feed one weighted total.
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_exams_class_term on exams(class_id, term_id);

create table exam_questions (
  exam_id uuid not null references exams(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  order_index int not null default 0,
  primary key (exam_id, question_id)
);

-- a scheduled sitting window for an exam ("Batch A: 8:00–9:00")
create table exam_batches (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  label text not null,               -- 'Batch A'
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lab_room text,                     -- optional: which computer lab
  created_at timestamptz not null default now()
);
create index idx_batches_exam on exam_batches(exam_id);

-- which students are assigned to which batch for a given exam
create table batch_students (
  batch_id uuid not null references exam_batches(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  primary key (batch_id, student_id)
);

-- ----------------------------------------------------------------------------
-- 6. LIVE SESSIONS — powers single-active-session enforcement + auto-save
-- ----------------------------------------------------------------------------
create table student_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  batch_id uuid not null references exam_batches(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  status session_status not null default 'active',
  device_fingerprint text,           -- browser/device token, blocks concurrent logins
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- enforce one non-terminal session per student per exam
  unique (exam_id, student_id)
);
create index idx_sessions_student on student_exam_sessions(student_id);
create index idx_sessions_status on student_exam_sessions(status);

create table student_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references student_exam_sessions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  selected_option_id uuid references question_options(id),  -- objective answers
  free_text_answer text,                                    -- fill_blank / theory
  is_flagged boolean not null default false,
  is_auto_graded boolean,
  points_awarded numeric(6,2),
  feedback text,                              -- teacher's comment, shown to the student
  graded_by uuid references users(id),        -- teacher, for manual marking
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);
create index idx_answers_session on student_answers(session_id);

-- ----------------------------------------------------------------------------
-- 7. RESULTS
-- ----------------------------------------------------------------------------
create table results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  session_id uuid references student_exam_sessions(id),
  objective_score numeric(6,2) not null default 0,
  theory_score numeric(6,2) not null default 0,
  total_score numeric(6,2) not null default 0,
  grade_letter text,
  position_in_class int,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, exam_id)
);
create index idx_results_student on results(student_id);
create index idx_results_exam on results(exam_id);

-- cumulative term result per student per subject (CA/CBT % + terminal exam %)
create table term_subject_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  ca_score numeric(6,2) not null default 0,      -- weighted CBT/CA contribution
  terminal_score numeric(6,2) not null default 0,-- weighted terminal exam contribution
  total_score numeric(6,2) not null default 0,
  grade_letter text,
  teacher_comment text,
  published boolean not null default false,
  unique (student_id, subject_id, term_id)
);

create table grading_scale (
  id uuid primary key default gen_random_uuid(),
  min_score numeric(5,2) not null,
  max_score numeric(5,2) not null,
  grade_letter text not null,
  remark text                        -- 'Excellent', 'Good', 'Fail', etc.
);

-- ----------------------------------------------------------------------------
-- 8. LAB INFRASTRUCTURE + SCHOOL PROFILE
-- ----------------------------------------------------------------------------
create table lab_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity int not null default 30,
  created_at timestamptz not null default now()
);

-- reusable daily time slots (e.g. "Batch A: 8:00-9:00") teachers pick from
-- in the Exam Builder instead of retyping the same windows every time.
create table batch_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

-- singleton table (always exactly one row) — the report-card letterhead
-- and any school-wide branding read from here.
create table school_profile (
  id boolean primary key default true check (id),
  school_name text not null default 'Soaring Fountain Group of Schools',
  motto text,
  address text,
  logo_url text,
  updated_at timestamptz not null default now()
);
insert into school_profile (id) values (true);

alter table lab_rooms enable row level security;
alter table batch_templates enable row level security;
alter table school_profile enable row level security;

create policy staff_read_lab_rooms on lab_rooms
  for select using (current_role_is('super_admin') or current_role_is('teacher'));
create policy admin_write_lab_rooms on lab_rooms
  for all using (current_role_is('super_admin'));

create policy staff_read_batch_templates on batch_templates
  for select using (current_role_is('super_admin') or current_role_is('teacher'));
create policy admin_write_batch_templates on batch_templates
  for all using (current_role_is('super_admin'));

-- Name/motto/logo show on the login and register pages too, not just
-- once someone's already signed in — a school's own branding isn't
-- sensitive the way any of the real school-records tables are, so this
-- is deliberately public rather than gated on auth.uid().
create policy anyone_read_school_profile on school_profile
  for select using (true);
create policy admin_write_school_profile on school_profile
  for update using (current_role_is('super_admin'));

-- ----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY — enable + starter policies (for the original tables;
-- lab_rooms/batch_templates/school_profile above have their own policies)
-- ----------------------------------------------------------------------------
-- Enable RLS on every table that holds student- or role-sensitive data.
alter table users enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table exams enable row level security;
alter table exam_batches enable row level security;
alter table batch_students enable row level security;
alter table student_exam_sessions enable row level security;
alter table student_answers enable row level security;
alter table results enable row level security;
alter table term_subject_results enable row level security;

-- Reference/lookup tables — no sensitive content, but RLS still needs to
-- be turned on explicitly or they're wide open to the anon key by default.
alter table academic_sessions enable row level security;
alter table terms enable row level security;
alter table classes enable row level security;
alter table subjects enable row level security;
alter table class_subjects enable row level security;
alter table teacher_subjects enable row level security;
alter table exam_questions enable row level security;
alter table grading_scale enable row level security;

-- Helper: read the caller's role/id from their own users row — defined
-- up in §3, right after `users`, so §8's policies could reach it too.

-- Students may only see and modify their own answers/sessions/results.
create policy student_sessions_own on student_exam_sessions
  for select using (student_id = auth.uid());

create policy student_answers_own on student_answers
  for all using (
    session_id in (select id from student_exam_sessions where student_id = auth.uid())
  );

-- Teachers can read (not write — grading goes through the app's own
-- privileged API route) student_answers for sessions belonging to an
-- exam they created. Needed by the Grading Queue's list view and Class
-- Analytics' per-question stats.
create policy teacher_read_student_answers on student_answers
  for select using (
    current_role_is('super_admin')
    or exists (
      select 1 from student_exam_sessions ses
      join exams e on e.id = ses.exam_id
      where ses.id = student_answers.session_id and e.created_by = auth.uid()
    )
  );

create policy student_results_own on results
  for select using (student_id = auth.uid() and published = true);

-- Teachers may manage questions/exams they created; admins see everything.
create policy teacher_owns_questions on questions
  for all using (created_by = auth.uid() or current_role_is('super_admin'));

-- Every signed-in user can read their own profile row — needed right after
-- login to resolve role/name before any role-specific policy applies.
create policy users_read_own on users
  for select using (id = auth.uid());

create policy admin_full_access_users on users
  for all using (current_role_is('super_admin'));

-- Nothing previously let a teacher read a student's row at all — only
-- your own row, or everything if you're a super_admin. That silently
-- broke every teacher-side feature needing a class roster (batch
-- enrollment, My Exams' completion counts, the student roster view):
-- an RLS-filtered SELECT just returns zero rows, not an error, so
-- there was nothing to catch. Scoped narrowly: only role='student'
-- rows, only for a caller who is themselves a teacher, and only for a
-- class they're actually assigned via teacher_subjects — with the same
-- "no assignments yet -> don't lock them out" fallback the app's own
-- fetch code already uses elsewhere, so a newly created teacher isn't
-- stuck at zero visibility before an admin assigns them anything.
create policy teachers_read_own_students on users
  for select using (
    role = 'student'
    and current_role_is('teacher')
    and (
      exists (select 1 from teacher_subjects ts where ts.teacher_id = auth.uid() and ts.class_id = users.class_id)
      or not exists (select 1 from teacher_subjects ts where ts.teacher_id = auth.uid())
    )
  );

-- exams <-> exam_batches <-> batch_students: same recursion class as
-- current_role_is() above, but across three tables instead of looping a
-- single function through itself. exams_student_read reads exam_batches;
-- exam_batches_manage reads exams; exam_batches_student_read reads
-- batch_students; batch_students_manage reads exam_batches+exams. Any one
-- of those, evaluated under RLS, triggers the target table's own
-- policies — which read back into a table already mid-evaluation —
-- forever, until Postgres gives up ("infinite recursion detected in
-- policy for relation ..."). Same fix as current_role_is: wrap every
-- cross-table read in a SECURITY DEFINER function, so it runs with the
-- function owner's privileges and bypasses RLS on the table it's
-- checking, instead of re-entering that table's policies.
create or replace function current_user_created_exam(target_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from exams where id = target_exam_id and created_by = auth.uid()
  );
$$;

create or replace function current_user_assigned_to_exam(target_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from exam_batches eb
    join batch_students bs on bs.batch_id = eb.id
    where eb.exam_id = target_exam_id and bs.student_id = auth.uid()
  );
$$;

create or replace function current_user_assigned_to_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from batch_students where batch_id = target_batch_id and student_id = auth.uid()
  );
$$;

create or replace function current_user_owns_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from exam_batches eb
    join exams e on e.id = eb.exam_id
    where eb.id = target_batch_id and e.created_by = auth.uid()
  );
$$;

-- exams: teacher who created it (or admin) manages it; a student can read
-- an exam once they're assigned to one of its batches.
create policy exams_manage on exams
  for all using (
    current_role_is('super_admin')
    or created_by = auth.uid()
  );

create policy exams_student_read on exams
  for select using (
    current_user_assigned_to_exam(exams.id)
  );

-- exam_batches: same owning-teacher/admin pattern; students read only the
-- batch(es) they're actually assigned to.
create policy exam_batches_manage on exam_batches
  for all using (
    current_role_is('super_admin')
    or current_user_created_exam(exam_batches.exam_id)
  );

create policy exam_batches_student_read on exam_batches
  for select using (
    current_user_assigned_to_batch(exam_batches.id)
  );

-- batch_students: the owning teacher/admin assigns students; a student can
-- read their own assignment rows (to know which batch they're in).
create policy batch_students_manage on batch_students
  for all using (
    current_role_is('super_admin')
    or current_user_owns_batch(batch_students.batch_id)
  );

create policy batch_students_own_read on batch_students
  for select using (student_id = auth.uid());

-- term_subject_results: admin manages; a student reads only their own
-- published rollup. (Not yet written to by any app code today — report
-- cards compute the rollup live from `results` — but locked down now
-- rather than left wide open until something does use it.)
create policy term_subject_results_admin on term_subject_results
  for all using (current_role_is('super_admin'));

create policy term_subject_results_student_read on term_subject_results
  for select using (student_id = auth.uid() and published = true);

-- (current_role_is is defined once, up near the `users` table — see the
-- comment there for why SECURITY DEFINER matters.)

-- NOTE: extend these policies per-table as the app's access patterns firm up —
-- these are a secure-by-default starting point, not the full policy set for
-- every write path (e.g. teacher grading, batch assignment).

-- Reference/lookup tables: any signed-in user can read, only admin writes.
create policy authenticated_read_academic_sessions on academic_sessions for select using (auth.uid() is not null);
create policy admin_write_academic_sessions on academic_sessions for all using (current_role_is('super_admin'));

create policy authenticated_read_terms on terms for select using (auth.uid() is not null);
create policy admin_write_terms on terms for all using (current_role_is('super_admin'));

create policy authenticated_read_classes on classes for select using (auth.uid() is not null);
create policy admin_write_classes on classes for all using (current_role_is('super_admin'));

create policy authenticated_read_subjects on subjects for select using (auth.uid() is not null);
create policy admin_write_subjects on subjects for all using (current_role_is('super_admin'));

create policy authenticated_read_class_subjects on class_subjects for select using (auth.uid() is not null);
create policy admin_write_class_subjects on class_subjects for all using (current_role_is('super_admin'));

create policy authenticated_read_teacher_subjects on teacher_subjects for select using (auth.uid() is not null);
create policy admin_write_teacher_subjects on teacher_subjects for all using (current_role_is('super_admin'));

create policy authenticated_read_grading_scale on grading_scale for select using (auth.uid() is not null);
create policy admin_write_grading_scale on grading_scale for all using (current_role_is('super_admin'));

-- exam_questions: teachers/admins manage their own exams; students can see
-- which questions belong to an exam only once they have a session for it.
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

create policy exam_questions_student_read on exam_questions
  for select using (
    exists (
      select 1 from student_exam_sessions ses
      where ses.exam_id = exam_questions.exam_id and ses.student_id = auth.uid()
    )
  );

-- question_options: deliberately NOT readable by students via RLS, even
-- for their own exam — is_correct would leak the answer key through the
-- REST API directly. Student-facing reads go through the app's API routes
-- using the service-role client, which strips is_correct before responding.
create policy question_options_manage on question_options
  for all using (
    current_role_is('super_admin')
    or exists (select 1 from questions q where q.id = question_options.question_id and q.created_by = auth.uid())
  );
