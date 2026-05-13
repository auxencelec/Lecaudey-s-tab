-- ============================================================
-- Seed the Lecaudey family.
--
-- This migration creates the family + private spaces.
-- Profiles are linked to auth users by ID and must be created
-- AFTER the auth users exist (see scripts/setup-family.ts).
-- ============================================================

insert into public.families (id, name, default_currency)
values ('00000000-0000-0000-0000-00000000fa01', 'Lecaudey', 'EUR')
on conflict (id) do nothing;
