-- Update the trigger function to handle anonymous users (who may not have an email)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Backfill: create profiles for any auth.users that don't have one yet
insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;
