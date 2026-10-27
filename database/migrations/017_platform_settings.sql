-- 017 — The platform owner's own look (theme + background color).
--
-- The owner belongs to no school, so there is no `schools` row to hold these.
-- A single settings row, readable and editable ONLY by the platform owner;
-- no school user and no signed-out visitor can see or change it.
create table platform_settings (
  id              boolean primary key default true check (id),  -- exactly one row
  theme_color     text not null default '#AB1509' check (theme_color ~* '^#[0-9a-f]{6}$'),
  secondary_color text not null default '#fff7d3' check (secondary_color ~* '^#[0-9a-f]{6}$'),
  updated_at      timestamptz not null default now()
);
insert into platform_settings default values;

alter table platform_settings enable row level security;

create policy platform_settings_owner_read on platform_settings
  for select to authenticated using (current_role_is('platform_owner'));

create policy platform_settings_owner_update on platform_settings
  for update to authenticated
  using (current_role_is('platform_owner'))
  with check (current_role_is('platform_owner'));

revoke all on platform_settings from anon;
revoke insert, delete on platform_settings from authenticated;
