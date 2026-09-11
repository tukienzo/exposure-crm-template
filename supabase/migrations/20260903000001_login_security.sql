create table if not exists public.crm_login_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  device_id text not null,
  ip_address inet,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  login_count integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists crm_login_activity_email_last_seen_idx
  on public.crm_login_activity (email, last_seen_at desc);

alter table public.crm_login_activity enable row level security;
revoke all on public.crm_login_activity from anon, authenticated;

