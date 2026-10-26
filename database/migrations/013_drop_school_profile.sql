-- 013 — Run this ONLY AFTER the multi-tenant code is deployed.
--
-- The old single-school `school_profile` table is replaced by `schools`
-- (012 already copied its contents into school #1). 012 deliberately left
-- it in place so the previous version of the app kept working during the
-- deploy; once nothing reads it any more, remove it.
drop table if exists school_profile;
