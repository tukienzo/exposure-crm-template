create table if not exists public.loom_consultations (
  id uuid primary key default gen_random_uuid(),
  loom_id text not null unique,
  loom_url text not null,
  title text not null,
  folder text,
  duration_seconds integer,
  recorded_at timestamptz,
  transcript_text text,
  transcript_segments jsonb not null default '[]'::jsonb,
  import_status text not null default 'pending' check (import_status in ('pending','imported','analyzing','analyzed','error')),
  import_error text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.testimonial_candidates (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.loom_consultations(id) on delete cascade,
  start_seconds numeric not null,
  end_seconds numeric not null,
  speaker text,
  summary text not null,
  exact_quote text not null,
  category text not null check (category in ('resultado','agradecimiento','antes_despues','cambio_emocional','objecion_superada')),
  strength smallint not null default 1 check (strength between 1 and 5),
  confidence numeric,
  status text not null default 'detected' check (status in ('detected','reviewed','published','discarded')),
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id, fingerprint)
);

create index if not exists loom_consultations_status_idx on public.loom_consultations(import_status);
create index if not exists loom_consultations_recorded_idx on public.loom_consultations(recorded_at desc);
create index if not exists testimonial_candidates_status_idx on public.testimonial_candidates(status, strength desc);
create index if not exists testimonial_candidates_consultation_idx on public.testimonial_candidates(consultation_id);

alter table public.loom_consultations enable row level security;
alter table public.testimonial_candidates enable row level security;

