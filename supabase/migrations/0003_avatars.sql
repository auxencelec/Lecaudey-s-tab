-- ============================================================
-- Avatars: profile photo support.
--
-- Run this SQL in Supabase → SQL Editor.
-- It:
--   1. Adds avatar_url column to profiles
--   2. Creates a public "avatars" storage bucket
--   3. RLS policies: each user can upload/update/delete files
--      under their own folder; everyone can read.
-- ============================================================

-- 1) Column
alter table public.profiles
  add column if not exists avatar_url text;

-- 2) Bucket (public so the file can be displayed without signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2 * 1024 * 1024,             -- 2 MB max per file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) Policies on storage.objects (the actual files)
-- Drop and recreate to keep idempotent.
drop policy if exists "Avatars: read all"     on storage.objects;
drop policy if exists "Avatars: upload own"   on storage.objects;
drop policy if exists "Avatars: update own"   on storage.objects;
drop policy if exists "Avatars: delete own"   on storage.objects;

-- Anyone (even unauthenticated) can read avatars (public profile pictures).
create policy "Avatars: read all" on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder (avatars/<uid>/...).
create policy "Avatars: upload own" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Avatars: update own" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Avatars: delete own" on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
