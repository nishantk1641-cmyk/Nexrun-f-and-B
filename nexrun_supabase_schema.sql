create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  plan text not null default 'free' check (plan in ('free','pro')),
  ai_credits integer not null default 20 check (ai_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  files jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists chats_user_id_idx on public.chats(user_id);
create index if not exists chats_project_id_idx on public.chats(project_id);
create index if not exists credit_transactions_user_id_idx on public.credit_transactions(user_id);

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects for each row execute function public.update_updated_at();
drop trigger if exists chats_updated_at on public.chats;
create trigger chats_updated_at before update on public.chats for each row execute function public.update_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,name,email,plan,ai_credits)
  values(new.id,coalesce(new.raw_user_meta_data->>'name',''),new.email,'free',20)
  on conflict(id) do nothing;
  insert into public.credit_transactions(user_id,amount,type,description)
  values(new.id,20,'signup','Welcome AI credits');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.chats enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using(auth.uid()=id);
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects for select to authenticated using(auth.uid()=user_id);
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects for delete to authenticated using(auth.uid()=user_id);
drop policy if exists chats_select_own on public.chats;
create policy chats_select_own on public.chats for select to authenticated using(auth.uid()=user_id);
drop policy if exists chats_insert_own on public.chats;
create policy chats_insert_own on public.chats for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists chats_update_own on public.chats;
create policy chats_update_own on public.chats for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists chats_delete_own on public.chats;
create policy chats_delete_own on public.chats for delete to authenticated using(auth.uid()=user_id);
drop policy if exists credits_select_own on public.credit_transactions;
create policy credits_select_own on public.credit_transactions for select to authenticated using(auth.uid()=user_id);

create or replace function public.consume_ai_credit()
returns integer language plpgsql security definer set search_path=public as $$
declare uid uuid; remaining integer;
begin
  uid:=auth.uid(); if uid is null then raise exception 'Not authenticated'; end if;
  update public.profiles set ai_credits=ai_credits-1 where id=uid and ai_credits>0 returning ai_credits into remaining;
  if not found then raise exception 'Insufficient AI credits'; end if;
  insert into public.credit_transactions(user_id,amount,type,description) values(uid,-1,'ai_usage','AI generation');
  return remaining;
end; $$;
grant execute on function public.consume_ai_credit() to authenticated;

create or replace function public.add_ai_credits(target_user_id uuid, credit_amount integer, credit_description text default 'AI credits added')
returns integer language plpgsql security definer set search_path=public as $$
declare new_balance integer;
begin
  if credit_amount<=0 then raise exception 'Credit amount must be positive'; end if;
  update public.profiles set ai_credits=ai_credits+credit_amount where id=target_user_id returning ai_credits into new_balance;
  if not found then raise exception 'User profile not found'; end if;
  insert into public.credit_transactions(user_id,amount,type,description) values(target_user_id,credit_amount,'purchase',credit_description);
  return new_balance;
end; $$;
revoke execute on function public.add_ai_credits(uuid,integer,text) from public,anon,authenticated;
