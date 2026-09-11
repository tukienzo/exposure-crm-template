begin;

create or replace function public.finance_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and tm.estado = 'aprobado'
      and tm.rol in ('CEO', 'Contaduria')
  );
$$;

revoke all on function public.finance_has_access() from public;
grant execute on function public.finance_has_access() to authenticated;

create table if not exists public.finance_sources (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  source_kind text not null check (source_kind in (
    'crm', 'mercury', 'stripe', 'reca', 'crypto', 'cash', 'payroll',
    'expenses', 'historical_close', 'manual_confirmation'
  )),
  source_ref_hash text not null,
  source_date date,
  imported_at timestamptz not null default now(),
  movement_count integer not null default 0 check (movement_count >= 0),
  reconciled_count integer not null default 0 check (reconciled_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (period_start, source_kind, source_ref_hash)
);

create table if not exists public.finance_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  version integer not null check (version > 0),
  person_key text,
  role_key text not null,
  calculation_base text not null,
  percentage numeric(9,4),
  tiers jsonb not null default '[]'::jsonb,
  fixed_amount numeric(16,2),
  fixed_currency text check (fixed_currency is null or fixed_currency in ('USD', 'USDT', 'ARS')),
  bonuses jsonb not null default '[]'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  effective_from date not null,
  effective_to date,
  approval_status text not null default 'provisional'
    check (approval_status in ('provisional', 'confirmado', 'reemplazado')),
  approved_by_role text,
  approved_at timestamptz,
  evidence_refs jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (rule_key, version),
  check (effective_to is null or effective_to >= effective_from),
  check (percentage is null or percentage between 0 and 100)
);

create table if not exists public.finance_partner_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  partner_key text not null unique check (partner_key in ('partner_a', 'partner_b')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.finance_closings (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'provisional'
    check (status in ('provisional', 'confirmado')),
  base_currency text not null default 'USD' check (base_currency in ('USD', 'USDT', 'ARS')),
  external_income numeric(16,2) not null default 0,
  platform_fees numeric(16,2) not null default 0,
  payroll numeric(16,2) not null default 0,
  software_marketing numeric(16,2) not null default 0,
  operating_expenses numeric(16,2) not null default 0,
  obligations numeric(16,2) not null default 0,
  reserves numeric(16,2) not null default 0,
  adjustments numeric(16,2) not null default 0,
  distributable_profit numeric(16,2) not null default 0,
  partner_share numeric(16,2) not null default 0,
  formula text not null default
    'ingresos - plataforma - payroll - software/marketing - gastos operativos - obligaciones - reservas + ajustes',
  source_count integer not null default 0 check (source_count >= 0),
  total_movements integer not null default 0 check (total_movements >= 0),
  reconciled_movements integer not null default 0 check (reconciled_movements >= 0),
  unexplained_difference numeric(16,2) not null default 0,
  explained_differences jsonb not null default '[]'::jsonb,
  payroll_reconciled boolean not null default false,
  bonuses_reconciled boolean not null default false,
  distribution_reproducible boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (period_start, revision),
  check (reconciled_movements <= total_movements),
  check (
    status <> 'confirmado'
    or (
      reconciled_movements = total_movements
      and abs(unexplained_difference) < 0.005
      and payroll_reconciled
      and bonuses_reconciled
      and distribution_reproducible
    )
  )
);

create table if not exists public.finance_movements (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.finance_closings(id) on delete cascade,
  occurred_at timestamptz not null,
  channel text not null check (channel in (
    'mercury_savings', 'mercury_checking', 'stripe', 'reca_ars',
    'reca_usd', 'trust_usdt', 'binance', 'cash_usd', 'cash_ars', 'other'
  )),
  direction text not null check (direction in ('in', 'out')),
  classification text not null check (classification in (
    'ingreso', 'transferencia_interna', 'gasto_operativo',
    'distribucion_socio', 'por_clasificar'
  )),
  amount_original numeric(16,2) not null,
  currency_original text not null check (currency_original in ('USD', 'USDT', 'ARS')),
  exchange_rate numeric(16,6),
  amount_base numeric(16,2),
  internal_transfer boolean not null default false,
  reconciliation_status text not null default 'pendiente'
    check (reconciliation_status in ('pendiente', 'conciliado', 'diferencia_explicada')),
  evidence_ref_hash text,
  rule_version_id uuid references public.finance_rule_versions(id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (amount_original >= 0),
  check (
    classification <> 'transferencia_interna'
    or internal_transfer
  )
);

create table if not exists public.finance_adjustments (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.finance_closings(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in (
    'reserve', 'obligation', 'advance', 'withdrawal', 'debt',
    'dispute', 'fx_difference', 'reimbursement', 'other'
  )),
  partner_key text,
  amount numeric(16,2) not null,
  currency text not null check (currency in ('USD', 'USDT', 'ARS')),
  affects_margin boolean not null default true,
  status text not null default 'provisional'
    check (status in ('provisional', 'confirmado', 'revertido')),
  evidence_ref_hash text,
  explanation text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.finance_checklist_items (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.finance_closings(id) on delete cascade,
  item_key text not null,
  label text not null,
  sort_order integer not null default 0,
  required boolean not null default true,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'completo', 'no_aplica', 'bloqueado')),
  completed_at timestamptz,
  completed_by uuid,
  evidence_ref_hash text,
  notes text,
  unique (closing_id, item_key)
);

create table if not exists public.finance_approvals (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.finance_closings(id) on delete cascade,
  partner_key text not null check (partner_key in ('partner_a', 'partner_b')),
  status text not null check (status in ('pendiente', 'aprobado', 'rechazado')),
  approved_at timestamptz,
  approved_by uuid,
  comment text,
  unique (closing_id, partner_key)
);

create table if not exists public.finance_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  old_data jsonb,
  new_data jsonb
);

create or replace function public.finance_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.finance_audit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_audit_log (
    table_name, record_id, action, changed_by, old_data, new_data
  ) values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists finance_closings_updated_at on public.finance_closings;
create trigger finance_closings_updated_at
before update on public.finance_closings
for each row execute function public.finance_set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'finance_rule_versions', 'finance_partner_authorizations', 'finance_closings', 'finance_movements',
    'finance_adjustments', 'finance_checklist_items', 'finance_approvals'
  ]
  loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.finance_audit_change()',
      table_name, table_name
    );
  end loop;
end
$$;

create index if not exists finance_sources_period_idx
  on public.finance_sources(period_start, source_kind);
create index if not exists finance_rules_effective_idx
  on public.finance_rule_versions(rule_key, effective_from, effective_to);
create index if not exists finance_closings_period_idx
  on public.finance_closings(period_start desc, revision desc);
create index if not exists finance_movements_closing_idx
  on public.finance_movements(closing_id, reconciliation_status);
create index if not exists finance_movements_channel_idx
  on public.finance_movements(channel, occurred_at);
create index if not exists finance_checklist_closing_idx
  on public.finance_checklist_items(closing_id, sort_order);
create index if not exists finance_audit_record_idx
  on public.finance_audit_log(table_name, record_id, changed_at desc);

insert into public.finance_rule_versions (
  rule_key, version, role_key, calculation_base, percentage,
  effective_from, approval_status, approved_by_role, approved_at,
  evidence_refs, notes
) values (
  'partner_distribution', 1, 'partner', 'distributable_profit', 50,
  date '2024-01-01', 'confirmado', 'CEO', now(),
  '["declared_operating_rule"]'::jsonb,
  'La distribución se aplica después de reservas, obligaciones, gastos y ajustes.'
)
on conflict (rule_key, version) do nothing;

alter table public.finance_sources enable row level security;
alter table public.finance_rule_versions enable row level security;
alter table public.finance_partner_authorizations enable row level security;
alter table public.finance_closings enable row level security;
alter table public.finance_movements enable row level security;
alter table public.finance_adjustments enable row level security;
alter table public.finance_checklist_items enable row level security;
alter table public.finance_approvals enable row level security;
alter table public.finance_audit_log enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'finance_sources', 'finance_rule_versions', 'finance_partner_authorizations', 'finance_closings',
    'finance_movements', 'finance_adjustments', 'finance_checklist_items',
    'finance_approvals', 'finance_audit_log'
  ]
  loop
    execute format('drop policy if exists %I_finance_read on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_finance_write on public.%I', table_name, table_name);
    execute format(
      'create policy %I_finance_read on public.%I for select to authenticated using (public.finance_has_access())',
      table_name, table_name
    );
    execute format(
      'create policy %I_finance_write on public.%I for all to authenticated using (public.finance_has_access()) with check (public.finance_has_access())',
      table_name, table_name
    );
  end loop;
end
$$;

commit;
