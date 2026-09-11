-- Conservative client consolidation. No rows are deleted.
alter table public.clientes
  add column if not exists record_status text not null default 'active',
  add column if not exists merged_into_client_id bigint references public.clientes(id) on delete restrict,
  add column if not exists merge_reason text,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by text;

do $$ begin
  alter table public.clientes add constraint clientes_record_status_check
    check (record_status in ('active','historical','merged','review'));
exception when duplicate_object then null; end $$;

update public.clientes
set record_status = 'historical'
where etapa = 'historico' and record_status = 'active';

create index if not exists clientes_person_record_status_idx
  on public.clientes(person_id, record_status, fecha_ingreso desc);

create index if not exists clientes_merged_into_idx
  on public.clientes(merged_into_client_id)
  where merged_into_client_id is not null;

