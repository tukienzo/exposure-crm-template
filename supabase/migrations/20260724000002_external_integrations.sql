-- Catálogo auditable de objetos externos. Solo aplicar en Supabase preview.
create table if not exists public.crm_integration_assets (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  asset_type text not null,
  source_id text not null,
  name text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(source, asset_type, source_id)
);

create index if not exists crm_integration_assets_source_idx
  on public.crm_integration_assets(source, asset_type, last_seen_at desc);

alter table public.crm_integration_assets enable row level security;

comment on table public.crm_integration_assets is
  'Inventario idempotente de tags, flujos, campos y growth tools de integraciones externas.';
