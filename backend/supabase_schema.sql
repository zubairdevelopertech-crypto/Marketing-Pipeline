-- ═══════════════════════════════════════════════════════════════════
-- Creative Pipeline — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════

-- ── Clients ──────────────────────────────────────────────────────────
create table if not exists clients (
  slug        text primary key,
  name        text not null,
  product     text,
  market      text,
  created_at  timestamptz default now()
);

-- ── Pipeline JSON data (context, briefs, review) ──────────────────────
create table if not exists pipeline_data (
  id          bigint generated always as identity primary key,
  client_slug text not null references clients(slug) on delete cascade,
  type        text not null,  -- 'master_context' | 'content_briefs' | 'review_report'
  data        jsonb not null,
  updated_at  timestamptz default now(),
  unique (client_slug, type)
);

-- ── Client documents (extracted text; uploads do not require local disk) ──
create table if not exists client_documents (
  id             bigint generated always as identity primary key,
  client_slug    text not null references clients(slug) on delete cascade,
  filename       text not null,
  extracted_text text not null,
  size_bytes     int,
  updated_at     timestamptz default now(),
  unique (client_slug, filename)
);

-- ── Creatives ─────────────────────────────────────────────────────────
create table if not exists creatives (
  id          bigint generated always as identity primary key,
  client_slug text not null references clients(slug) on delete cascade,
  label       text not null,  -- e.g. FORMAT-01-VERSION-A
  format_id   text not null,
  version     text not null,
  status      text not null,  -- 'success' | 'error' | 'prompt_only' | 'pending'
  image_url   text,
  score       int,
  ctr_tier    text,
  headline    text,
  hook_line   text,
  body_copy   text,
  cta_text    text,
  error       text,
  brief_json  jsonb,
  updated_at  timestamptz default now(),
  unique (client_slug, label)
);

-- ── Indexes ──────────────────────────────────────────────────────────
create index if not exists idx_creatives_client on creatives(client_slug);
create index if not exists idx_pipeline_data_client on pipeline_data(client_slug);
create index if not exists idx_client_documents_slug on client_documents(client_slug);

-- ── Row Level Security (open for now — add auth later) ───────────────
alter table clients          enable row level security;
alter table pipeline_data    enable row level security;
alter table creatives        enable row level security;
alter table client_documents enable row level security;

-- Allow all operations with anon key (tighten with auth when you add users)
-- Re-runnable: drop first so "policy already exists" does not error (42710).
drop policy if exists "allow all clients" on clients;
create policy "allow all clients" on clients for all using (true) with check (true);

drop policy if exists "allow all pipeline_data" on pipeline_data;
create policy "allow all pipeline_data" on pipeline_data for all using (true) with check (true);

drop policy if exists "allow all creatives" on creatives;
create policy "allow all creatives" on creatives for all using (true) with check (true);

drop policy if exists "allow all client_documents" on client_documents;
create policy "allow all client_documents" on client_documents for all using (true) with check (true);

-- If creatives already existed without brief_json, add the column (safe to re-run)
alter table creatives add column if not exists brief_json jsonb;

-- ── Supabase Storage for images (Vercel-compatible persistent storage) ──────
-- Run these steps in the Supabase Dashboard (NOT the SQL editor):
--   1. Go to: Storage → New Bucket
--   2. Name: creatives
--   3. Check "Public bucket" (so image URLs work without auth)
--   4. Save
-- After creating the bucket, run this policy so the API can upload:
-- (Replace 'creatives' with your bucket name if different)

-- Uncomment and run in SQL editor after creating the bucket:
-- create policy "allow all uploads" on storage.objects for all using (bucket_id = 'creatives') with check (bucket_id = 'creatives');
