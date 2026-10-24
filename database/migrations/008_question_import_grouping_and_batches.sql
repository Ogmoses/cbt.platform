-- Lets a set of bulk-imported questions be shown and selected as one
-- unit (see components/teacher/QuestionBankManager.tsx and
-- components/teacher/ExamBuilder.tsx) rather than N separate rows mixed
-- in with hand-typed questions. Every question created from the same
-- import batch shares the same import_group_id; import_group_label is
-- the display name ("Subject — Class"), duplicated onto every row in
-- the group rather than looked up separately, since the group has no
-- other row of its own to look it up from.
alter table questions add column if not exists import_group_id uuid;
alter table questions add column if not exists import_group_label text;
create index if not exists idx_questions_import_group on questions(import_group_id) where import_group_id is not null;

-- Holds an in-progress bulk import review so closing the review screen
-- before finishing doesn't lose the work — see
-- components/teacher/QuestionImportModal.tsx. draft_questions mirrors
-- that component's ReviewQuestion[] shape directly (type, prompt,
-- options with isCorrect, points, topic, hadDiagram, warning) so saving
-- and resuming is a straight round-trip with no reshaping.
create table question_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  source_filename text,
  draft_questions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_import_batches_teacher on question_import_batches(created_by);

alter table question_import_batches enable row level security;
create policy teacher_manage_own_import_batches on question_import_batches
  for all using (created_by = auth.uid() or current_role_is('super_admin'));
