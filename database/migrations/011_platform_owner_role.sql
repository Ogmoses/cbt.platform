-- 011 — Adds the `platform_owner` role (the person who runs the whole SaaS).
--
-- Must be its own migration: Postgres won't let a newly added enum value be
-- used in the same transaction that created it, and 012 uses it right away.
alter type user_role add value if not exists 'platform_owner';
