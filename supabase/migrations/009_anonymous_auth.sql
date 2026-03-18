-- Allow anonymous users (no email) to create profiles
alter table public.profiles alter column email drop not null;

-- Update trigger to handle null emails from anonymous signups
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
