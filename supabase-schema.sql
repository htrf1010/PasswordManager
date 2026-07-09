create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  site text not null,
  category text not null default '기타',
  encrypted_hint text not null,
  iv text not null,
  auth_tag text not null,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hints_user_id_updated_at_idx
  on public.hints (user_id, favorite desc, updated_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_hints_updated_at on public.hints;

create trigger set_hints_updated_at
before update on public.hints
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.hints enable row level security;
