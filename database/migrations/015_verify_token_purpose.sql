-- 015 — Token type for confirming a new school admin's email address
-- (school self-signup). Separate migration: Postgres can't use a newly added
-- enum value in the same transaction that created it.
alter type access_token_purpose add value if not exists 'verify';
