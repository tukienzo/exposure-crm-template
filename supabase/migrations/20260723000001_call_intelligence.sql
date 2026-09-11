create table if not exists public.crm_call_records (
  id uuid primary key default gen_random_uuid(),
  recording_id text not null unique,
  person_id uuid references public.crm_people(id) on delete set null,
  agenda_id bigint,
  call_type text not null default 'sales' check (call_type in ('sales','onboarding','other')),
  occurred_at timestamptz,
  fathom_url text,
  title text,
  participants jsonb not null default '[]'::jsonb,
  transcript text,
  fathom_summary text,
  trace_analysis jsonb not null default '{}'::jsonb,
  match_method text,
  match_confidence numeric(4,3),
  needs_review boolean not null default false,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_call_records_person_time_idx
  on public.crm_call_records(person_id, occurred_at desc);
create index if not exists crm_call_records_agenda_idx
  on public.crm_call_records(agenda_id);
create index if not exists crm_call_records_type_time_idx
  on public.crm_call_records(call_type, occurred_at desc);
create index if not exists crm_call_records_angle_idx
  on public.crm_call_records((trace_analysis->>'primary_angle'), occurred_at desc);

alter table public.crm_call_records enable row level security;

drop policy if exists crm_call_records_team_read on public.crm_call_records;
create policy crm_call_records_team_read on public.crm_call_records
for select to authenticated using (
  exists (
    select 1 from public.team_members tm
    where lower(tm.email) = lower((auth.jwt()->>'email')::text)
      and tm.estado = 'aprobado'
  )
);

comment on table public.crm_call_records is
  'Registro auditable de llamadas Fathom. Conserva transcripción, análisis trazable y matching; no reemplaza el dato bruto por inferencias.';

