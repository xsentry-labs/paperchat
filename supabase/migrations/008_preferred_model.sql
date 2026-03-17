-- Add preferred_model column to profiles
alter table public.profiles
  add column if not exists preferred_model text default 'fast';
