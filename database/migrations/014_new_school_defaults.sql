-- 014 — A newly ACTIVATED school (approved from pending, or added already
-- active by the platform owner) starts with a standard grading scale, so its
-- report cards work from day one. The school can edit it in Settings.
--
-- Fires only if the school has no grading scale yet, so approving a school
-- twice, or Soaring Fountain (which already has its own scale), is untouched.
-- Remarks for D and E are suggestions the school can change.
create or replace function seed_school_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and not exists (select 1 from grading_scale where school_id = new.id) then
    insert into grading_scale (school_id, min_score, max_score, grade_letter, remark) values
      (new.id, 70, 100, 'A', 'Excellent'),
      (new.id, 60,  69, 'B', 'Very Good'),
      (new.id, 50,  59, 'C', 'Good'),
      (new.id, 45,  49, 'D', 'Fair'),
      (new.id, 40,  44, 'E', 'Pass'),
      (new.id,  0,  39, 'F', 'Fail');
  end if;
  return new;
end $$;

create trigger seed_school_defaults
  after insert or update of status on schools
  for each row execute function seed_school_defaults();
