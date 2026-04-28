-- BuildFactory Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- TEMPLATES
-- ─────────────────────────────────────────────
create table if not exists templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  category    text not null,
  description text,
  file_path   text not null,        -- path in Supabase Storage
  file_size   bigint,
  preview_url text,
  placeholders jsonb default '[]',  -- detected {{PLACEHOLDER}} tokens
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────────
create table if not exists leads (
  id           uuid primary key default uuid_generate_v4(),
  company_name text not null,
  category     text not null,
  city         text not null,
  phone        text,
  email        text,
  website      text,
  notes        text,
  status       text not null default 'new',   -- new | contacted | converted
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─────────────────────────────────────────────
-- BUILDS
-- ─────────────────────────────────────────────
create table if not exists builds (
  id           uuid primary key default uuid_generate_v4(),
  lead_id      uuid references leads(id) on delete cascade,
  template_id  uuid references templates(id) on delete set null,
  status       text not null default 'pending',  -- pending | building | done | failed
  output_path  text,          -- path to generated ZIP in Storage
  error_msg    text,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger templates_updated_at
  before update on templates
  for each row execute function handle_updated_at();

create trigger leads_updated_at
  before update on leads
  for each row execute function handle_updated_at();

create trigger builds_updated_at
  before update on builds
  for each row execute function handle_updated_at();

-- ─────────────────────────────────────────────
-- STORAGE BUCKETS (run separately or via dashboard)
-- ─────────────────────────────────────────────
-- insert into storage.buckets (id, name, public) values ('templates', 'templates', false);
-- insert into storage.buckets (id, name, public) values ('builds', 'builds', false);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY (permissive for MVP - tighten for production)
-- ─────────────────────────────────────────────
alter table templates enable row level security;
alter table leads enable row level security;
alter table builds enable row level security;

-- For MVP: allow all authenticated operations
create policy "Allow all on templates" on templates for all using (true) with check (true);
create policy "Allow all on leads" on leads for all using (true) with check (true);
create policy "Allow all on builds" on builds for all using (true) with check (true);
