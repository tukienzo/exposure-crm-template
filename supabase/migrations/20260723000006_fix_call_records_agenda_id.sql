-- crm_call_records.agenda_id was declared bigint, but public.agendas.id is uuid.
-- This mismatch caused every Fathom link-matched-to-agenda upsert to fail with
-- "invalid input syntax for type bigint". No rows had a non-null agenda_id yet
-- (matches only ever reached the update path and errored before persisting),
-- so this is a safe, idempotent, non-lossy type correction for preview only.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'crm_call_records'
      and column_name = 'agenda_id'
      and data_type <> 'uuid'
  ) then
    alter table public.crm_call_records
      alter column agenda_id type uuid using null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.agendas') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'crm_call_records_agenda_id_fkey'
     )
  then
    alter table public.crm_call_records
      add constraint crm_call_records_agenda_id_fkey
      foreign key (agenda_id) references public.agendas(id) on delete set null;
  end if;
end $$;
