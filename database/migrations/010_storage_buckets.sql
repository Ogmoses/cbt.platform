-- 010 — Real file storage for question images and the school logo, replacing
-- the `data:` URLs previously saved straight into table columns.
--
-- Both buckets are public-read (the images are shown to students mid-exam
-- and on report cards, and file names are random UUIDs), but write access is
-- locked down by RLS on storage.objects:
--   question-images : teachers/admins, and only inside their own `<user id>/` folder
--   school-assets   : super_admin only
-- Size and type limits are enforced by the bucket itself, not just the UI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('question-images', 'question-images', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif']),
  ('school-assets',   'school-assets',   true, 2097152, array['image/png','image/jpeg'])  -- PNG/JPEG only: the report-card PDF renderer can't draw SVG/WebP
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- question-images
create policy question_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and (current_role_is('teacher') or current_role_is('super_admin'))
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy question_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'question-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or current_role_is('super_admin'))
  );

create policy question_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'question-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or current_role_is('super_admin'))
  );

-- school-assets (logo)
create policy school_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'school-assets' and current_role_is('super_admin'));

create policy school_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'school-assets' and current_role_is('super_admin'));

create policy school_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'school-assets' and current_role_is('super_admin'));
