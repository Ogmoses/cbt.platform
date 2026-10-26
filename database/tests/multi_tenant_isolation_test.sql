-- Multi-tenant isolation test.
--
-- Builds two fake schools (A and B) inside a transaction, pretends to be each
-- kind of user, and checks that nothing crosses between schools. It ends with
-- rolled back at the end, so it leaves no trace — safe to run on a Supabase branch, or as a
-- dry run on the real database after 011 + 012 are applied.
--
-- Run it in the Supabase SQL editor as the default (postgres) role, all at
-- once. It finishes with an INTENTIONAL error whose message is the report
-- (one PASS/FAIL line per check) — raising it is what guarantees the rollback,
-- so nothing is ever saved. Every line should say PASS.
-- (Needs migrations 011 and 012 applied first. For a dry run BEFORE 012 is applied, prepend
-- the contents of 012 after the `begin;` — that is how it was verified: 33 of 33 PASS.)

begin;

create temp table t_results (at timestamptz default clock_timestamp(), test text, passed boolean);
grant all on t_results to public;

create function public._t_count(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q into n; return n; end $$;

-- true if running q raises an error (permission denied, RLS, FK, trigger...)
create function public._t_fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

create function public._t_check(name text, ok boolean) returns void language sql as $$
  insert into t_results (test, passed) values (name, coalesce(ok, false));
$$;

-- ------------------------------------------------------------------ fixtures
insert into schools (id, name, code, status) values
  ('00000000-0000-0000-0000-00000000000a', 'School A', 'school-a', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'School B', 'school-b', 'active');

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a-admin@test.local',   'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'a-teacher@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'a-student@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b-admin@test.local',   'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b-teacher@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'b-student@test.local', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000001', 'owner@test.local',     'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000001', 'spare@test.local',     'authenticated', 'authenticated');

-- Both schools have a student with the SAME ID "001" and a subject with the SAME code.
insert into users (id, role, full_name, email, admission_number, staff_id, school_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'super_admin', 'A Admin',   'a-admin@test.local',   null,  'ADM1', '00000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'teacher',     'A Teacher', 'a-teacher@test.local', null,  'T1',   '00000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'student',     'A Student', 'a-student@test.local', '001', null,   '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'super_admin', 'B Admin',   'b-admin@test.local',   null,  'ADM1', '00000000-0000-0000-0000-00000000000b'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'teacher',     'B Teacher', 'b-teacher@test.local', null,  'T1',   '00000000-0000-0000-0000-00000000000b'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'student',     'B Student', 'b-student@test.local', '001', null,   '00000000-0000-0000-0000-00000000000b');
insert into users (id, role, full_name, email, school_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'platform_owner', 'Owner', 'owner@test.local', null);

insert into subjects (id, name, code, school_id) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'Maths', 'MTH101', '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'Maths', 'MTH101', '00000000-0000-0000-0000-00000000000b');
insert into classes (id, name, school_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'JSS1', '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'JSS1', '00000000-0000-0000-0000-00000000000b');
insert into academic_sessions (id, name, school_id) values
  ('aaaaaaaa-3333-0000-0000-000000000001', '2026/2027', '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-3333-0000-0000-000000000001', '2026/2027', '00000000-0000-0000-0000-00000000000b');
insert into terms (id, academic_session_id, name, school_id) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001', 'First Term', '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-4444-0000-0000-000000000001', 'bbbbbbbb-3333-0000-0000-000000000001', 'First Term', '00000000-0000-0000-0000-00000000000b');
insert into questions (id, subject_id, created_by, type, prompt, school_id) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'short_theory', 'A question', '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-5555-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'short_theory', 'B question', '00000000-0000-0000-0000-00000000000b');
insert into exams (id, title, subject_id, class_id, term_id, created_by, duration_minutes, school_id) values
  ('bbbbbbbb-6666-0000-0000-000000000001', 'B exam', 'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-4444-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 30, '00000000-0000-0000-0000-00000000000b');

select public._t_check('fixtures: same student ID 001 allowed in two schools',
  (select count(*) from users where admission_number = '001') = 2);
select public._t_check('fixtures: same subject code MTH101 allowed in two schools',
  (select count(*) from subjects where code = 'MTH101') = 2);

-- ------------------------------------------- database-level (even for superuser)
select public._t_check('composite FK: exam in A cannot use a subject from B',
  public._t_fails($q$ insert into exams (title, subject_id, class_id, term_id, created_by, duration_minutes, school_id)
    values ('bad', 'bbbbbbbb-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
            'aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 30,
            '00000000-0000-0000-0000-00000000000a') $q$));
select public._t_check('composite FK: question in A cannot be created by a user of B',
  public._t_fails($q$ insert into questions (subject_id, created_by, type, prompt, school_id)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'short_theory', 'bad',
            '00000000-0000-0000-0000-00000000000a') $q$));
select public._t_check('school_id cannot be changed after creation',
  public._t_fails($q$ update questions set school_id = '00000000-0000-0000-0000-00000000000b'
    where id = 'aaaaaaaa-5555-0000-0000-000000000001' $q$));
select public._t_check('service role insert without school_id fails loudly',
  public._t_fails($q$ insert into classes (name) values ('orphan') $q$));
select public._t_check('only platform_owner may have no school',
  public._t_fails($q$ insert into users (id, role, full_name, school_id)
    values ('dddddddd-0000-0000-0000-000000000001', 'teacher', 'No School', null) $q$));

-- ------------------------------------------------------ School A teacher (RLS)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);

select public._t_check('A teacher: sees only own school''s subjects',
  public._t_count('select count(*) from subjects') = 1);
select public._t_check('A teacher: sees only A questions (not B)',
  public._t_count($q$ select count(*) from questions where id = 'bbbbbbbb-5555-0000-0000-000000000001' $q$) = 0
  and public._t_count('select count(*) from questions') = 1);
select public._t_check('A teacher: cannot see B exams',
  public._t_count($q$ select count(*) from exams where id = 'bbbbbbbb-6666-0000-0000-000000000001' $q$) = 0);
select public._t_check('A teacher: cannot see B users',
  public._t_count($q$ select count(*) from users where school_id = '00000000-0000-0000-0000-00000000000b' $q$) = 0);
select public._t_check('A teacher: cannot insert a question into school B',
  public._t_fails($q$ insert into questions (subject_id, created_by, type, prompt, school_id)
    values ('bbbbbbbb-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'short_theory', 'x',
            '00000000-0000-0000-0000-00000000000b') $q$));
select public._t_check('A teacher: insert without school_id lands in school A automatically',
  public._t_count($q$ with i as (insert into questions (subject_id, created_by, type, prompt)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'short_theory', 'auto')
    returning school_id) select count(*) from i where school_id = '00000000-0000-0000-0000-00000000000a' $q$) = 1);
select public._t_check('A teacher: cannot change own school status',
  public._t_fails($q$ update schools set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000a' $q$));

-- ------------------------------------------------------ School A admin (RLS)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select public._t_check('A admin: sees only own school''s users (3)',
  public._t_count('select count(*) from users') = 3);
select public._t_check('A admin: can update own branding',
  public._t_count($q$ with u as (update schools set theme_color = '#112233'
    where id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*) from u $q$) = 1);
select public._t_check('A admin: cannot update school B branding (0 rows)',
  public._t_count($q$ with u as (update schools set theme_color = '#112233'
    where id = '00000000-0000-0000-0000-00000000000b' returning 1) select count(*) from u $q$) = 0);
select public._t_check('A admin: cannot change school status or code',
  public._t_fails($q$ update schools set status = 'active' where id = '00000000-0000-0000-0000-00000000000a' $q$)
  and public._t_fails($q$ update schools set code = 'hijack' where id = '00000000-0000-0000-0000-00000000000a' $q$));
select public._t_check('A admin: cannot promote a user to platform_owner',
  public._t_fails($q$ update users set role = 'platform_owner', school_id = null
    where id = 'aaaaaaaa-0000-0000-0000-000000000002' $q$));
select public._t_check('A admin: cannot move a user into school B',
  public._t_fails($q$ update users set school_id = '00000000-0000-0000-0000-00000000000b'
    where id = 'aaaaaaaa-0000-0000-0000-000000000002' $q$));
select public._t_check('A admin: cannot see platform stats',
  public._t_count('select count(*) from platform_school_stats()') = 0);

-- --------------------------------------------------------- School A student
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public._t_check('A student: sees only own users row',
  public._t_count('select count(*) from users') = 1);
select public._t_check('A student: cannot read the question bank',
  public._t_count('select count(*) from questions') = 0);

-- ------------------------------------------------------------ Platform owner
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public._t_check('owner: sees all schools',
  public._t_count('select count(*) from schools') >= 2);
select public._t_check('owner: sees NO school data (questions, users of others)',
  public._t_count('select count(*) from questions') = 0
  and public._t_count($q$ select count(*) from users where id <> 'cccccccc-0000-0000-0000-000000000001' $q$) = 0);
select public._t_check('owner: platform stats include both schools',
  public._t_count($q$ select count(*) from platform_school_stats() where code in ('school-a','school-b') $q$) = 2);

-- ------------------------------------------------------------------ Anonymous
reset role;
set local role anon;
select public._t_check('anon: cannot read schools table',
  public._t_fails('select count(*) from schools'));
select public._t_check('anon: cannot read questions',
  public._t_fails('select count(*) from questions') or public._t_count('select count(*) from questions') = 0);
select public._t_check('anon: branding lookup works for one school by code',
  public._t_count($q$ select count(*) from get_school_branding('school-b') where name = 'School B' $q$) = 1);
select public._t_check('anon: branding lookup for unknown code returns nothing',
  public._t_count($q$ select count(*) from get_school_branding('nope-nope') $q$) = 0);

-- ------------------------------------------------- Suspended school is locked out
reset role;
update schools set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000a';
select public._t_check('suspended: branding hides the name',
  (select name from get_school_branding('school-a')) is null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public._t_check('suspended: A teacher sees no subjects/questions',
  public._t_count('select count(*) from subjects') = 0 and public._t_count('select count(*) from questions') = 0);
select public._t_check('suspended: A teacher can still read own school row (to show a notice)',
  public._t_count('select count(*) from schools') = 1);

-- ------------------------------------------------------------------- Report
reset role;
do $$
declare report text;
begin
  select string_agg(case when passed then 'PASS  ' else 'FAIL  ' end || test, E'\n' order by at)
    into report from t_results;
  raise exception E'TEST REPORT (this error is intentional: it rolls everything back)\n\n%\n\n% of % checks passed',
    report, (select count(*) filter (where passed) from t_results), (select count(*) from t_results);
end $$;
