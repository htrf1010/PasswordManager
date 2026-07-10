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

create table if not exists public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.user_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  site_key text not null,
  name text not null,
  min_length integer not null default 8,
  max_length integer,
  require_uppercase boolean not null default false,
  require_lowercase boolean not null default false,
  require_number boolean not null default false,
  require_special boolean not null default false,
  allow_special boolean not null default true,
  allowed_specials text not null default '!@#$%^&*?',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, site_key)
);

create index if not exists hints_user_id_updated_at_idx
  on public.hints (user_id, favorite desc, updated_at desc);

create index if not exists user_rules_user_id_name_idx
  on public.user_rules (user_id, name);

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

drop trigger if exists set_user_rules_updated_at on public.user_rules;
create trigger set_user_rules_updated_at
before update on public.user_rules
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.hints enable row level security;
alter table public.user_categories enable row level security;
alter table public.user_rules enable row level security;
