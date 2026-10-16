# Soaring Fountain CBT & School Management Platform 

A complete, deployable Next.js (App Router) + Supabase project — not just
source files to copy in. `npm install` and `npm run dev` work directly in
this folder once Supabase env vars are set.

**Deploying this for real? See [`DEPLOYMENT.md`](./DEPLOYMENT.md)** —
step-by-step from this folder to a live URL on GitHub + Supabase + Vercel,
including the one manual step every setup needs (bootstrapping the first
Super Admin account) and a troubleshooting section.

## Setup notes
- Fonts: `app/layout.tsx` already loads **Plus Jakarta Sans** (display)
  and **Inter** (body) via `next/font/google`, exposed as
  `--font-plus-jakarta` / `--font-inter` to match `tailwind.config.ts`.
- Every file with a `// TODO` comment is a stub where real Supabase calls
  (auth, queries) replace sample data — the shapes already mirror the schema.
- Env vars: copy `.env.example` to `.env.local` and fill in your Supabase
  project's URL, publishable key, and secret key (see `DEPLOYMENT.md` Part C
  for exactly where to find each one, including a note on Supabase's
  ongoing anon/service_role → publishable/secret key rename).
- Report cards: needs real font files registered with `@react-pdf/renderer`
  (see `public/fonts/README.md`) — the rest of the app doesn't depend on
  this, so it's safe to add later.
- Next.js 16 renamed `middleware.ts` to `proxy.ts` (and the exported
  function from `middleware` to `proxy`) — this project already uses the
  new convention in `proxy.ts` at the root.

## Built so far
| Area | File |
|---|---|
| Database schema | `database/schema.sql` |
| Tailwind design tokens | `tailwind.config.ts` |
| App shell (sidebar/navbar) | `components/layout/*.tsx` |
| Login (student PIN + staff password) | `components/auth/LoginForm.tsx`, `app/login/page.tsx` |
| Student Exam Launchpad | `components/student/ExamLaunchpad.tsx`, `app/student/page.tsx` |
| Live CBT Exam runner | `components/exam/ExamInterface.tsx` |
| Teacher: Question Bank (create/edit/delete, image upload) | `components/teacher/QuestionBankManager.tsx`, `QuestionEditor.tsx`, `app/teacher/questions/page.tsx` |
| Teacher: Exam Builder (rules, question picker, batch scheduling) | `components/teacher/ExamBuilder.tsx`, `app/teacher/exams/page.tsx` |
| Teacher: Grading Queue (manual marking, save & next) | `components/teacher/GradingQueue.tsx`, `GradingPanel.tsx`, `app/teacher/grading/page.tsx` |
| Teacher: Class Analytics (stats, distribution, hardest questions, roster) | `components/teacher/ClassAnalytics.tsx`, `app/teacher/analytics/page.tsx` |

Teacher portal is now complete end to end.

| Admin: Overview (stats + today's batches, lab-conflict flagging) | `components/admin/AdminOverview.tsx`, `app/admin/page.tsx` |
| Admin: Students & Teachers (CRUD + bulk CSV import) | `components/admin/PeopleManager.tsx`, `PersonEditor.tsx`, `BulkImportModal.tsx`, `csv.ts`, `app/admin/people/page.tsx` |
| Admin: Classes & Subjects (sessions, terms, classes, subjects) | `components/admin/AcademicsManager.tsx`, `AcademicsEditors.tsx`, `app/admin/academics/page.tsx` |
| Admin: Lab Batches (rooms + reusable time templates) | `components/admin/LabBatchesManager.tsx`, `app/admin/batches/page.tsx` |
| Admin: Results & Analytics (publish queue, class/subject performance) | `components/admin/ResultsAnalytics.tsx`, `app/admin/results/page.tsx` |
| Admin: Settings (school profile, grading scale) | `components/admin/SettingsManager.tsx`, `app/admin/settings/page.tsx` |

**All three portals (Student, Teacher, Admin) are now fully built.**

| Backend: Supabase client factories | `lib/supabase/client.ts`, `server.ts` |
| Backend: pure grading logic (auto-mark, grade-letter lookup, weighted CA/terminal rollup) | `lib/grading.ts` |
| Backend: seeded shuffle (stable per-session question/option order) | `lib/shuffle.ts` |
| Backend: start a session — batch-window check, roster check, single-active-session enforcement, stale-session reclaim | `app/api/exam-sessions/start/route.ts` |
| Backend: autosave endpoint (called every 5s by ExamInterface) | `app/api/exam-sessions/answers/route.ts` |
| Backend: submit endpoint — persists final answers, auto-marks objective questions, writes the `results` row | `app/api/exam-sessions/submit/route.ts` |
| Backend: manual-grading endpoint — records a teacher's mark, rolls up `results` once a session is fully graded | `app/api/student-answers/grade/route.ts` |
| Student exam page wired to the above (device fingerprint, loading/error states) | `app/student/exam/[examId]/page.tsx` |

## Still to build
- **Known gap**: creating a teacher doesn't populate `teacher_subjects` —
  that table needs a (teacher, subject, **class**) triple, and the People
  form only collects subjects, not which classes they're taught to. Needs
  its own assignment screen; for now the field is accepted in the UI but
  not persisted.
- Settings' logo upload still saves a `data:` URL straight into
  `school_profile.logo_url` rather than uploading to Supabase Storage first
  — fine for a demo, wasteful for production.
- Report card PDFs need the three Plus Jakarta Sans `.ttf` files added
  manually (see `public/fonts/README.md`) — not yet done as of this build.
- Supabase's **Leaked Password Protection** (checks new passwords against
  HaveIBeenPwned) is off by default and isn't something the project-level
  connector can toggle — Dashboard → Authentication → Policies to enable it.
- Minor performance-only lints remain (a few unindexed foreign keys, some
  policies that re-evaluate `auth.uid()` per row instead of once per query)
  — fine at this school's scale, not worth the migration churn yet.

| Auth: real Supabase sign-in (student PIN + staff password), pre-auth admission-number lookup | `app/login/page.tsx`, `app/api/auth/resolve-student-email/route.ts`, `lib/supabase/admin.ts` |
| Auth: session-refresh + route-protection proxy (Next.js 16 renamed `middleware.ts` to `proxy.ts`) | `proxy.ts` |
| Auth: shared "who's signed in" hook, used instead of hardcoded userName props | `lib/useAuthUser.ts` |
| Schema: added the three tables Lab Batches/Settings needed (`lab_rooms`, `batch_templates`, singleton `school_profile`) + their RLS policies | `database/schema.sql` §8 |
| Admin: every screen now runs on real Supabase queries | `app/admin/**/page.tsx` |
| Teacher: every screen (Question Bank, Exam Builder, Grading Queue, Class Analytics) now runs on real Supabase queries | `app/teacher/**/page.tsx` |
| Student: Exam Launchpad now shows the signed-in student's actual batches/results, not hardcoded sample data | `app/student/page.tsx` |
| Exam Builder: added the missing `isTerminal` toggle — without it, every exam defaulted to "not terminal" and report cards' Terminal column would always show 0 | `components/teacher/ExamBuilder.tsx` |

**Critical fixes found via Supabase's own security linter and a full RLS
audit** (these were live bugs, not applied to a copy — caught after the
first real deploy):
- 8 tables had **no RLS policy at all** (`academic_sessions`, `terms`,
  `classes`, `subjects`, `class_subjects`, `teacher_subjects`,
  `exam_questions`, `grading_scale`) — wide open to the publishable key.
  4 more (`exams`, `exam_batches`, `batch_students`, `term_subject_results`)
  had RLS *enabled* with zero policies — locked shut, even for admins.
- `question_options` was the same "locked shut" case — fixed by design to
  stay that way for direct client reads (`is_correct` must never be
  queryable by a student), with app code reading it via the service-role
  client instead.
- **The exam-taking flow itself was broken**: `/api/exam-sessions/start`,
  `/answers`, and `/submit` all queried `questions`/`question_options`
  using the RLS-bound client — but students have no SELECT policy on
  either table. In practice this meant empty exams, autosave silently
  mis-filing every multiple-choice answer as free text, and every
  objective question auto-graded as wrong regardless of the real answer.
  All three routes now use the service-role client, since each already
  re-implements its own authorization in code (batch window, roster,
  single-session enforcement) — that's the real boundary, not RLS.
- `/api/student-answers/grade` had the identical issue for the *write*
  side: a teacher grading another student's answer would have the update
  silently affect zero rows under RLS — no error, nothing saved. Same fix.
- Added a `teacher_read_student_answers` policy so Grading Queue and Class
  Analytics can read (never write) other students' answers directly —
  the one case where extending RLS was cleaner than another API route.

**Every screen across all three portals is now wired to real Supabase —
none of the sample-data constants from earlier passes remain anywhere in
`app/`.**

**Since the first live deploy, two more real bugs surfaced and got fixed:**
- A stray extra `)` in `app/student/page.tsx`'s Supabase select string —
  these strings are type-checked at compile time, so a malformed one
  produces a `ParserError` type rather than a normal syntax error.
- `teacher_subjects` was a real, working table with nothing populating or
  reading it — Question Bank and Exam Builder showed every teacher every
  subject in the school. Closed the loop both ways: the People screen now
  has a real subject-and-class assignment editor per teacher (writing to
  `teacher_subjects`), and Question Bank/Exam Builder now filter to a
  signed-in teacher's actual assignments — falling back to showing
  everything only if a teacher has zero assignments yet, so nobody's ever
  completely stuck.

**The Super Admin bootstrap is done** — Moses (`ogmoses321@gmail.com`) is
`super_admin` in `public.users`, matching the Supabase Auth user created
by hand. Grading scale defaults (A–F) are seeded. Classes, subjects, and
real students/teachers still need creating through the app.

**Deliberately not done, and why:** Settings' logo upload still saves a
`data:` URL instead of uploading to Supabase Storage. Fixing it properly
means creating a bucket, writing its RLS policies, and rewriting the
upload handlers in two components — real work with real risk of new bugs,
and unlike everything above, a `data:` URL logo doesn't break anything,
it's just inefficient. Left for a dedicated pass rather than rushed here.

## Pass 4: two real 404s, loading states, mobile overflow, and the invite flow

**Two pages the app promised and never built:**
- `app/teacher/page.tsx` (Teacher Overview) didn't exist at all — the
  sidebar linked to it *and* the login flow redirected every teacher
  straight there, so signing in as a teacher was a guaranteed 404. Built
  it for real: stat cards, today's batches across the teacher's own
  exams, quick links to the other four teacher screens.
- `app/student/batches/page.tsx` and `app/student/results/page.tsx` —
  same story, linked from the student sidebar since the beginning, routes
  never created. Built as focused pages (full history/schedule, not just
  the launchpad's summary), not just redirects back to `/student`.

**Blank-screen-during-load, fixed everywhere at once:** every dashboard
page used to `return null` while its data fetched, which read as the app
freezing rather than loading. Added `components/layout/PageLoading.tsx`
and swapped it into all 12 pages that had the old pattern, plus the 3
new ones — `DashboardLayout` (sidebar/navbar) now renders immediately
either way, only the content area shows the loading state.

**Mobile layout overflow** (the screenshots): `SettingsManager`'s grading
scale editor forced 5 fixed grid columns with no mobile fallback — wide
enough to overflow a phone screen and drag the *whole page* into
horizontal scroll, which is why unrelated content looked clipped/shifted
in the screenshots too, not just that one table. Rebuilt it with a real
mobile layout (stacked cards) below `sm:`, kept the grid table above it.
Also found `PersonEditor`'s subject/class dropdowns missing `min-w-0` —
native `<select>` elements don't shrink below their content's width in a
flex row without it, a second real contributor to the same symptom.
Audited the whole project for both patterns (fixed-column grids without
a mobile breakpoint; flex-1 inputs/selects without min-w-0) — these were
the only instances. Added `overflow-x: hidden` on `html`/`body` in
`globals.css` as a backstop regardless.

**Teacher accounts now use a real invite-by-email flow, students a
4-digit PIN:**
- Creating a teacher (single or via bulk import) now calls Supabase's
  `inviteUserByEmail` instead of generating a password — no credential
  exists for the admin to share; the teacher gets an actual email, clicks
  it, and lands on the new `app/register/page.tsx` to set their own
  password, then routes to `/teacher` (or `/admin` if invited as an
  admin).
- Students dropped from a 6-digit to a 4-digit PIN, still admin-generated
  and shown once.
- **Needs one manual step to actually work**: Supabase → Authentication →
  URL Configuration → **Redirect URLs** needs the deployed domain's
  `/register` path added (e.g. `https://your-app.vercel.app/register`),
  or invite links will fail to redirect. Also worth knowing: Supabase's
  built-in email sender is rate-limited and meant for testing — a school
  actually inviting many teachers wants real SMTP configured under
  Authentication → Emails.

## Pass 5: the mobile overflow's actual root cause, and a resend-access action

**The mobile overflow bug had a specific, identifiable cause**, not just
"needs more responsive tweaking": iOS Safari auto-detects and auto-links
plain-text emails/phone numbers/dates in page content by default — which
is why the teacher's email rendered as an unstyled blue underlined link
in the screenshots, and very likely why its `text-overflow: ellipsis`
truncation broke (a known WebKit quirk: the auto-injected `<a>` tag
disrupts the parent's ellipsis calculation). Added `format-detection:
telephone=no, email=no, address=no, date=no` to the root layout's
metadata, which disables this globally in one place rather than needing
a per-component workaround.

**Audited every list-row-with-action-buttons pattern in the app** for the
underlying structural risk (name/email text competing horizontally with
multiple buttons in a row that doesn't stack on mobile) — `PeopleManager`
was the only one actually broken (4 possible buttons + two lines of
often-long text), but rebuilt it and 4 other, lower-risk rows
(`AcademicsManager`'s classes/subjects, `LabBatchesManager`'s
templates/rooms) to stack vertically below `sm:` regardless, since a
`ReportCardsManager` row already used this pattern from the start and it
held up fine.

**Added a real "resend access" action** for teacher rows — sends a
password-reset email (via `resetPasswordForEmail`, which works whether
or not the account already has a password) and reuses the existing
`/register` page to complete it. This is the actual fix for "the
credentials I set aren't working": the account's own history in
`auth.users` showed a password *was* set successfully once already — the
issue was a forgotten/mistyped password, not a broken flow, and there
was previously no way to recover from that without me manually
intervening in the database. Now there is.

## Pass 6: a real session race condition in /register, not account confusion

**What looked like password confusion was an actual bug.** `/register`
called `supabase.auth.getUser()` immediately on mount, assuming it would
reflect whichever invite/recovery link was just clicked. It doesn't
reliably — the token lives in the URL's hash fragment, which Supabase's
client parses *asynchronously*, and an immediate `getUser()` call can
race that process and resolve using whatever session already existed in
cookies instead (e.g. an admin still logged in on the same device).
That's exactly what happened: clicking a teacher's invite link while
already signed in as admin showed — and let the form overwrite the
password for — the *admin* account instead of the invited teacher's.

Fixed by never trusting an ambient session on this page: if the URL has
no invite/recovery token at all, the page shows "invalid link" rather
than falling back to whoever's already logged in; if it does, the page
waits specifically for the `SIGNED_IN`/`PASSWORD_RECOVERY` auth event
that fires once Supabase finishes processing *that* token, instead of
racing it.

**The admin account's password was reset directly** (via SQL, since the
UI path was untrustworthy until the fix above landed) to a known value —
see the conversation for what it was set to; change it once back in.

**Still open**: data (teachers/students/subjects) not showing up in admin
list pages even though it demonstrably exists in the database — ruled
out RLS policies (checked live, correct), the query code in both
`app/admin/people/page.tsx` and `app/admin/academics/page.tsx` (clean),
and an in-app-browser cookie theory (reproduced in plain Chrome too).
Current best lead is a stale session cookie from one of the admin
account's several recreations during this debugging — needs a genuinely
fresh sign-out/sign-in to confirm or rule out.

## Pass 7: the actual root cause — infinite recursion in current_role_is()

**Found it, definitively, by simulating the exact RLS-bound request the
app makes** (`set role authenticated` + a forged JWT claim, then running
the same query) rather than continuing to guess from symptoms. It
crashed with `stack depth limit exceeded`.

The bug: `current_role_is()` — the helper nearly every admin-facing RLS
policy calls to check "is this caller a super_admin" — queries `users`
internally. That internal query is *itself* subject to `users`' own RLS
policies, one of which (`admin_full_access_users`) calls
`current_role_is()` to decide access. Evaluating the function invokes
the function. Forever, until Postgres's stack overflows. This wasn't
limited to the `users` table — **every table whose policies reference
`current_role_is()`** hit the same crash, which by this point in the
build was most of the schema.

Two things compounded it into "empty lists with no visible error"
instead of an obvious crash:
- Writes going through the API routes (`/api/admin/people`, the exam-
  session routes, grading) use the **service-role client**, which
  bypasses RLS entirely — so those never triggered the recursion and kept
  working, which is exactly why creating accounts worked while the list
  showing them back didn't.
- Nearly every direct `supabase.from(...)` call in the admin/teacher
  pages destructured only `data`, discarding `error` — so when a query
  *did* hit the crash, the code treated the failed call as empty data
  instead of surfacing Postgres's actual error message.

**Both are fixed.** `current_role_is()` is now `SECURITY DEFINER` (the
standard Postgres fix for exactly this "RLS policy function queries its
own protected table" pattern), which runs its internal check with the
function owner's privileges, bypassing RLS for that one check and
breaking the cycle. Verified by re-running the same simulated request —
clean result, no crash. Separately, added `lib/supabaseErrors.ts`
(`orThrow`) and applied it across every write call in `app/admin/**` and
`app/teacher/**` that wasn't already checking `error`, so a real failure
shows up as a message in the UI instead of silently doing nothing —
this exact failure mode is what let the recursion bug hide as long as
it did.

**Also fixed while investigating:** `/register` had a second, genuine
bug — mail security scanners (common in schools/enterprises) "click"
links in emails to scan them for safety, which consumes Supabase's
one-time invite/recovery token before the real user gets to it. Added a
manual code-entry fallback (`supabase.auth.verifyOtp`) for when the link
itself comes back invalid. **Requires a one-time dashboard change this
code can't make itself**: Supabase → Authentication → Email Templates →
add `{{ .Token }}` to both the "Invite user" and "Reset Password"
templates, or there's no code for the fallback form to check against.

## Pass 5: replaced the invite/reset flow entirely with custom tokens

The scanner-eats-the-token problem above was worked around, not fixed —
it still relied on Supabase Auth's invite/recovery links, which are
consumed the instant they're *opened*, scanner or not. Replaced that whole
mechanism:

- New `access_tokens` table (`database/migrations/002_access_tokens.sql`)
  stores a hashed, single-use token per purpose (`invite` / `reset`) with
  its own expiry. See `lib/accessTokens.ts`.
- The token is only ever consumed when a password is actually submitted
  (`app/api/auth/set-password`, `app/api/auth/reset-password`) — never on
  page load. Opening the link does nothing, so a scanner opening it first
  no longer matters at all. No dashboard email-template change needed
  anymore, and the old manual code-entry fallback is gone since there's
  nothing left for it to work around.
- Teacher accounts are created directly (`admin.auth.admin.createUser`
  with a random, never-shared password) instead of via
  `inviteUserByEmail`; the real invite email is sent by us, via SMTP
  (`lib/mailer.ts`, provider-agnostic — configured for SendGrid via
  `SMTP_*` env vars, see `.env.example`), using our own branded template
  (`lib/emailTemplates.ts`).
- `resetPasswordForEmail` in `resend-access` is replaced the same way —
  issues a fresh `reset`-purpose token and emails it directly.
- `/register` (with its race-condition/stale-listener/fallback-tab fixes
  from earlier passes) is removed entirely, replaced by two simpler,
  purpose-specific pages: `/set-password` (new teacher) and
  `/reset-password` (existing teacher, admin-triggered). Neither needs any
  of the `onAuthStateChange` / hash-fragment handling `/register` needed,
  because there's no Supabase Auth session-from-URL step left to race.
