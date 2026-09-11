alter table public.pagos
  add column if not exists record_status text not null default 'active',
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists void_reason text;

do $$ begin
  alter table public.pagos add constraint pagos_record_status_check
    check (record_status in ('active','voided'));
exception when duplicate_object then null; end $$;

create index if not exists pagos_record_status_fecha_idx
  on public.pagos(record_status, fecha desc);

